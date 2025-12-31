use serde::{Deserialize, Serialize};
use crate::db::connections::{load_connections, ConnectionConfig};
use crate::db::pool_manager::{PoolManager, DatabasePool};
use crate::db::history;
use tauri::State;
use sqlx::{Row, Column};
use tiberius::{Config, AuthMethod, Client, QueryItem};
use tokio::net::TcpStream;
use tokio_util::compat::{TokioAsyncWriteCompatExt, Compat};
use futures_util::TryStreamExt;

/// Convert a tiberius row value to JSON value
fn mssql_value_to_json(row: &tiberius::Row, index: usize) -> serde_json::Value {
    if let Some(v) = row.try_get::<&str, _>(index).ok().flatten() {
        serde_json::Value::String(v.to_string())
    } else if let Some(v) = row.try_get::<i32, _>(index).ok().flatten() {
        serde_json::Value::Number(v.into())
    } else if let Some(v) = row.try_get::<i64, _>(index).ok().flatten() {
        serde_json::Value::Number(v.into())
    } else if let Some(v) = row.try_get::<f64, _>(index).ok().flatten() {
        serde_json::Value::Number(
            serde_json::Number::from_f64(v).unwrap_or(serde_json::Number::from(0))
        )
    } else if let Some(v) = row.try_get::<bool, _>(index).ok().flatten() {
        serde_json::Value::Bool(v)
    } else {
        // Try to get as string as fallback
        row.try_get::<&str, _>(index)
            .ok()
            .flatten()
            .map(|s| serde_json::Value::String(s.to_string()))
            .unwrap_or(serde_json::Value::Null)
    }
}

/// Helper function to create MSSQL client connection
async fn create_mssql_client(
    host: &str,
    port: u16,
    user: &str,
    password: &str,
    database: Option<&str>,
) -> Result<Client<Compat<TcpStream>>, String> {
    let mut config = Config::new();
    config.host(host);
    config.port(port);
    config.authentication(AuthMethod::sql_server(user, password));
    config.trust_cert();
    
    if let Some(db) = database {
        config.database(db);
    }
    
    let tcp = TcpStream::connect(config.get_addr())
        .await
        .map_err(|e| format!("无法连接到服务器 {}:{} - {}", host, port, e))?;
    
    tcp.set_nodelay(true)
        .map_err(|e| format!("设置 TCP 选项失败: {}", e))?;
    
    Client::connect(config, tcp.compat_write())
        .await
        .map_err(|e| format!("MSSQL 连接失败: {}", e))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
}

#[tauri::command]
pub async fn execute_sql(
    connection_id: String,
    sql: String,
    database: Option<String>,
    app: tauri::AppHandle,
    pool_manager: State<'_, PoolManager>,
) -> Result<QueryResult, String> {
    // Get connection from store
    let connections = load_connections(&app);
    let connection = connections
        .iter()
        .find(|c| c.id == connection_id)
        .ok_or_else(|| "Connection not found".to_string())?;

    let connection_name = connection.name.clone();

    // Handle MSSQL separately since it uses tiberius instead of sqlx
    let result = if connection.db_type == "mssql" {
        match &connection.config {
            ConnectionConfig::Mssql {
                host,
                port,
                user,
                password,
                database: config_db,
                ssl: _,
            } => {
                execute_sql_mssql(
                    host,
                    *port,
                    user,
                    password,
                    database.as_deref().or(config_db.as_deref()),
                    &sql,
                ).await
            }
            _ => Err("无效的 MSSQL 配置".to_string()),
        }
    } else {
        // Get or create pool (with database if specified)
        let pool = pool_manager.get_or_create_pool(connection, database.as_deref()).await?;

        // Execute SQL based on database type
        match pool {
            DatabasePool::Sqlite(p) => {
                execute_sql_sqlite(&p, &sql).await
            }
            DatabasePool::Mysql(p) => {
                execute_sql_mysql(&p, &sql).await
            }
            DatabasePool::Postgres(p) => {
                execute_sql_postgres(&p, &sql).await
            }
        }
    };

    // Save to history
    let rows_affected = result.as_ref().ok().and_then(|qr| extract_rows_affected(qr));
    let error_msg = result.as_ref().err().map(|e| e.clone());
    
    if let Err(e) = history::add_sql_history(
        connection_id.clone(),
        connection_name,
        sql,
        result.is_ok(),
        error_msg,
        rows_affected,
        app.clone(),
    ).await {
        eprintln!("Failed to save SQL history: {}", e);
    }

    result
}

/// Extract rows_affected from query result
fn extract_rows_affected(query_result: &QueryResult) -> Option<u64> {
    if query_result.rows.is_empty() {
        return None;
    }
    
    if query_result.columns.len() == 1 && query_result.columns[0] == "affected_rows" {
        // Try to extract the number from the first row
        query_result.rows[0].get(0).and_then(|val| {
            match val {
                serde_json::Value::Number(n) => {
                    n.as_u64().or_else(|| n.as_i64().map(|i| i as u64))
                }
                _ => None,
            }
        })
    } else {
        Some(query_result.rows.len() as u64)
    }
}

/// Convert a database row to a vector of JSON values (generic helper)
macro_rules! row_to_json_values {
    ($row:expr, $column_count:expr) => {{
        (0..$column_count)
            .map(|i| {
                // Try to get value as different types
                if let Ok(v) = $row.try_get::<String, _>(i) {
                    serde_json::Value::String(v)
                } else if let Ok(v) = $row.try_get::<i64, _>(i) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = $row.try_get::<f64, _>(i) {
                    serde_json::Value::Number(
                        serde_json::Number::from_f64(v).unwrap_or(serde_json::Number::from(0))
                    )
                } else if let Ok(v) = $row.try_get::<bool, _>(i) {
                    serde_json::Value::Bool(v)
                } else if let Ok(v) = $row.try_get::<chrono::NaiveDateTime, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else if let Ok(v) = $row.try_get::<chrono::DateTime<chrono::Utc>, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else {
                    // Fallback: try to get as string
                    $row.try_get::<String, _>(i)
                        .map(serde_json::Value::String)
                        .unwrap_or(serde_json::Value::Null)
                }
            })
            .collect()
    }};
}

async fn execute_sql_sqlite(
    pool: &sqlx::Pool<sqlx::Sqlite>,
    sql: &str,
) -> Result<QueryResult, String> {
    // Try to execute as a query first (SELECT statements)
    let query_result = sqlx::query(sql).fetch_all(pool).await;
    
    match query_result {
        Ok(rows) => {
            // Get column names - try from first row if available, otherwise try to get from a LIMIT 0 query
            let columns: Vec<String> = if rows.is_empty() {
                // If no rows, try to get column info by executing a LIMIT 0 query
                let limit_query = if sql.trim().to_uppercase().starts_with("SELECT") {
                    format!("{} LIMIT 0", sql.trim_end_matches(';').trim())
                } else {
                    sql.to_string()
                };
                
                match sqlx::query(&limit_query).fetch_all(pool).await {
                    Ok(limit_rows) => {
                        if !limit_rows.is_empty() {
                            limit_rows[0]
                                .columns()
                                .iter()
                                .map(|col| col.name().to_string())
                                .collect()
                        } else {
                            // Try to get from the original query's row structure
                            // This might work if the query structure is preserved
                            vec![]
                        }
                    }
                    Err(_) => vec![],
                }
            } else {
                // Get column names from the first row
                rows[0]
                    .columns()
                    .iter()
                    .map(|col| col.name().to_string())
                    .collect()
            };

            // Convert rows to JSON values
            let json_rows: Vec<Vec<serde_json::Value>> = rows
                .iter()
                .map(|row| row_to_json_values!(row, columns.len()))
                .collect();

            Ok(QueryResult {
                columns,
                rows: json_rows,
            })
        }
        Err(_) => {
            // If query fails, try to execute as a command (INSERT, UPDATE, DELETE, etc.)
            match sqlx::query(sql).execute(pool).await {
                Ok(result) => {
                    Ok(QueryResult {
                        columns: vec!["affected_rows".to_string()],
                        rows: vec![vec![serde_json::Value::Number(
                            serde_json::Number::from(result.rows_affected())
                        )]],
                    })
                }
                Err(e) => Err(format!("SQL execution failed: {}", e)),
            }
        }
    }
}

async fn execute_sql_mysql(
    pool: &sqlx::Pool<sqlx::MySql>,
    sql: &str,
) -> Result<QueryResult, String> {
    // Try to execute as a query first (SELECT statements)
    let query_result = sqlx::query(sql).fetch_all(pool).await;
    
    match query_result {
        Ok(rows) => {
            // Get column names - try from first row if available, otherwise try to get from a LIMIT 0 query
            let columns: Vec<String> = if rows.is_empty() {
                // If no rows, try to get column info by executing a LIMIT 0 query
                let limit_query = if sql.trim().to_uppercase().starts_with("SELECT") {
                    format!("{} LIMIT 0", sql.trim_end_matches(';').trim())
                } else {
                    sql.to_string()
                };
                
                match sqlx::query(&limit_query).fetch_all(pool).await {
                    Ok(limit_rows) => {
                        if !limit_rows.is_empty() {
                            limit_rows[0]
                                .columns()
                                .iter()
                                .map(|col| col.name().to_string())
                                .collect()
                        } else {
                            vec![]
                        }
                    }
                    Err(_) => vec![],
                }
            } else {
                // Get column names from the first row
                rows[0]
                    .columns()
                    .iter()
                    .map(|col| col.name().to_string())
                    .collect()
            };

            // Convert rows to JSON values
            let json_rows: Vec<Vec<serde_json::Value>> = rows
                .iter()
                .map(|row| row_to_json_values!(row, columns.len()))
                .collect();

            Ok(QueryResult {
                columns,
                rows: json_rows,
            })
        }
        Err(_) => {
            // If query fails, try to execute as a command (INSERT, UPDATE, DELETE, etc.)
            match sqlx::query(sql).execute(pool).await {
                Ok(result) => {
                    Ok(QueryResult {
                        columns: vec!["affected_rows".to_string()],
                        rows: vec![vec![serde_json::Value::Number(
                            serde_json::Number::from(result.rows_affected())
                        )]],
                    })
                }
                Err(e) => Err(format!("SQL execution failed: {}", e)),
            }
        }
    }
}

async fn execute_sql_postgres(
    pool: &sqlx::Pool<sqlx::Postgres>,
    sql: &str,
) -> Result<QueryResult, String> {
    // Try to execute as a query first (SELECT statements)
    let query_result = sqlx::query(sql).fetch_all(pool).await;
    
    match query_result {
        Ok(rows) => {
            // Get column names - try from first row if available, otherwise try to get from a LIMIT 0 query
            let columns: Vec<String> = if rows.is_empty() {
                // If no rows, try to get column info by executing a LIMIT 0 query
                // Check if SQL already has LIMIT clause
                let sql_upper = sql.trim().to_uppercase();
                let limit_query = if sql_upper.starts_with("SELECT") && !sql_upper.contains("LIMIT") {
                    format!("{} LIMIT 0", sql.trim_end_matches(';').trim())
                } else {
                    sql.to_string()
                };
                
                match sqlx::query(&limit_query).fetch_all(pool).await {
                    Ok(limit_rows) => {
                        if !limit_rows.is_empty() {
                            limit_rows[0]
                                .columns()
                                .iter()
                                .map(|col| col.name().to_string())
                                .collect()
                        } else {
                            vec![]
                        }
                    }
                    Err(_) => vec![],
                }
            } else {
                // Get column names from the first row
                rows[0]
                    .columns()
                    .iter()
                    .map(|col| col.name().to_string())
                    .collect()
            };

            // Convert rows to JSON values
            let json_rows: Vec<Vec<serde_json::Value>> = rows
                .iter()
                .map(|row| row_to_json_values!(row, columns.len()))
                .collect();

            Ok(QueryResult {
                columns,
                rows: json_rows,
            })
        }
        Err(_) => {
            // If query fails, try to execute as a command (INSERT, UPDATE, DELETE, etc.)
            match sqlx::query(sql).execute(pool).await {
                Ok(result) => {
                    Ok(QueryResult {
                        columns: vec!["affected_rows".to_string()],
                        rows: vec![vec![serde_json::Value::Number(
                            serde_json::Number::from(result.rows_affected())
                        )]],
                    })
                }
                Err(e) => Err(format!("SQL execution failed: {}", e)),
            }
        }
    }
}

async fn execute_sql_mssql(
    host: &str,
    port: u16,
    user: &str,
    password: &str,
    database: Option<&str>,
    sql: &str,
) -> Result<QueryResult, String> {
    // Create client connection using helper function
    let mut client: Client<Compat<TcpStream>> = create_mssql_client(host, port, user, password, database).await?;
    
    // Execute query
    let mut stream: tiberius::QueryStream<'_> = client.query(sql, &[])
        .await
        .map_err(|e| format!("SQL 执行失败: {}", e))?;
    
    // Collect metadata and rows
    let mut columns = Vec::new();
    let mut rows = Vec::new();
    
    while let Some(item) = stream.try_next().await
        .map_err(|e| format!("读取结果失败: {}", e))? {
        match item {
            QueryItem::Metadata(meta) => {
                // Extract column names from metadata
                if columns.is_empty() {
                    columns = meta.columns()
                        .iter()
                        .map(|col| col.name().to_string())
                        .collect();
                }
            }
            QueryItem::Row(row) => {
                if columns.is_empty() {
                    // If we haven't received metadata yet, we can't process the row
                    continue;
                }
                
                let row_data: Vec<serde_json::Value> = (0..columns.len())
                    .map(|i| mssql_value_to_json(&row, i))
                    .collect();
                rows.push(row_data);
            }
            _ => {}
        }
    }
    
    // If no columns found, this might be a non-query statement (INSERT, UPDATE, DELETE)
    if columns.is_empty() {
        // For non-query statements, we can't get affected rows easily with tiberius
        // Return a simple success message
        Ok(QueryResult {
            columns: vec!["status".to_string()],
            rows: vec![vec![serde_json::Value::String("执行成功".to_string())]],
        })
    } else {
        Ok(QueryResult {
            columns,
            rows,
        })
    }
}

