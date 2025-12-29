use serde::{Deserialize, Serialize};
use crate::db::connections::load_connections;
use crate::db::pool_manager::{PoolManager, DatabasePool};
use crate::db::history;
use tauri::State;
use sqlx::{Row, Column};

#[derive(Debug, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
}

#[tauri::command]
pub async fn execute_sql(
    connection_id: String,
    sql: String,
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

    // Get or create pool
    let pool = pool_manager.get_or_create_pool(connection, None).await?;

    // Execute SQL based on database type
    let result = match pool {
        DatabasePool::Sqlite(p) => {
            execute_sql_sqlite(&p, &sql).await
        }
        DatabasePool::Mysql(p) => {
            execute_sql_mysql(&p, &sql).await
        }
        DatabasePool::Postgres(p) => {
            execute_sql_postgres(&p, &sql).await
        }
    };

    // Save to history
    match &result {
        Ok(query_result) => {
            let rows_affected = if query_result.rows.is_empty() {
                None
            } else if query_result.columns.len() == 1 && query_result.columns[0] == "affected_rows" {
                // Try to extract the number from the first row
                if let Some(val) = query_result.rows[0].get(0) {
                    match val {
                        serde_json::Value::Number(n) => {
                            if let Some(num) = n.as_u64() {
                                Some(num)
                            } else if let Some(num) = n.as_i64() {
                                Some(num as u64)
                            } else {
                                None
                            }
                        }
                        _ => None,
                    }
                } else {
                    None
                }
            } else {
                Some(query_result.rows.len() as u64)
            };
            
            let _ = history::add_sql_history(
                connection_id.clone(),
                connection_name,
                sql,
                true,
                None,
                rows_affected,
                app.clone(),
            ).await;
        }
        Err(error_msg) => {
            let _ = history::add_sql_history(
                connection_id.clone(),
                connection_name,
                sql,
                false,
                Some(error_msg.clone()),
                None,
                app.clone(),
            ).await;
        }
    }

    result
}

async fn execute_sql_sqlite(
    pool: &sqlx::Pool<sqlx::Sqlite>,
    sql: &str,
) -> Result<QueryResult, String> {
    // Try to execute as a query first (SELECT statements)
    let query_result = sqlx::query(sql).fetch_all(pool).await;
    
    match query_result {
        Ok(rows) => {
            if rows.is_empty() {
                return Ok(QueryResult {
                    columns: vec![],
                    rows: vec![],
                });
            }

            // Get column names from the first row
            let columns: Vec<String> = rows[0]
                .columns()
                .iter()
                .map(|col| col.name().to_string())
                .collect();

            // Convert rows to JSON values
            let json_rows: Vec<Vec<serde_json::Value>> = rows
                .iter()
                .map(|row| {
                    (0..columns.len())
                        .map(|i| {
                            // Try to get value as different types
                            if let Ok(v) = row.try_get::<String, _>(i) {
                                serde_json::Value::String(v)
                            } else if let Ok(v) = row.try_get::<i64, _>(i) {
                                serde_json::Value::Number(v.into())
                            } else if let Ok(v) = row.try_get::<f64, _>(i) {
                                serde_json::Value::Number(
                                    serde_json::Number::from_f64(v).unwrap_or(serde_json::Number::from(0))
                                )
                            } else if let Ok(v) = row.try_get::<bool, _>(i) {
                                serde_json::Value::Bool(v)
                            } else if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(i) {
                                serde_json::Value::String(v.to_string())
                            } else if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(i) {
                                serde_json::Value::String(v.to_string())
                            } else {
                                // Fallback: try to get as string
                                row.try_get::<String, _>(i)
                                    .map(serde_json::Value::String)
                                    .unwrap_or(serde_json::Value::Null)
                            }
                        })
                        .collect()
                })
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
            if rows.is_empty() {
                return Ok(QueryResult {
                    columns: vec![],
                    rows: vec![],
                });
            }

            // Get column names from the first row
            let columns: Vec<String> = rows[0]
                .columns()
                .iter()
                .map(|col| col.name().to_string())
                .collect();

            // Convert rows to JSON values
            let json_rows: Vec<Vec<serde_json::Value>> = rows
                .iter()
                .map(|row| {
                    (0..columns.len())
                        .map(|i| {
                            // Try to get value as different types
                            if let Ok(v) = row.try_get::<String, _>(i) {
                                serde_json::Value::String(v)
                            } else if let Ok(v) = row.try_get::<i64, _>(i) {
                                serde_json::Value::Number(v.into())
                            } else if let Ok(v) = row.try_get::<f64, _>(i) {
                                serde_json::Value::Number(
                                    serde_json::Number::from_f64(v).unwrap_or(serde_json::Number::from(0))
                                )
                            } else if let Ok(v) = row.try_get::<bool, _>(i) {
                                serde_json::Value::Bool(v)
                            } else if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(i) {
                                serde_json::Value::String(v.to_string())
                            } else if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(i) {
                                serde_json::Value::String(v.to_string())
                            } else {
                                // Fallback: try to get as string
                                row.try_get::<String, _>(i)
                                    .map(serde_json::Value::String)
                                    .unwrap_or(serde_json::Value::Null)
                            }
                        })
                        .collect()
                })
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
            if rows.is_empty() {
                return Ok(QueryResult {
                    columns: vec![],
                    rows: vec![],
                });
            }

            // Get column names from the first row
            let columns: Vec<String> = rows[0]
                .columns()
                .iter()
                .map(|col| col.name().to_string())
                .collect();

            // Convert rows to JSON values
            let json_rows: Vec<Vec<serde_json::Value>> = rows
                .iter()
                .map(|row| {
                    (0..columns.len())
                        .map(|i| {
                            // Try to get value as different types
                            if let Ok(v) = row.try_get::<String, _>(i) {
                                serde_json::Value::String(v)
                            } else if let Ok(v) = row.try_get::<i64, _>(i) {
                                serde_json::Value::Number(v.into())
                            } else if let Ok(v) = row.try_get::<f64, _>(i) {
                                serde_json::Value::Number(
                                    serde_json::Number::from_f64(v).unwrap_or(serde_json::Number::from(0))
                                )
                            } else if let Ok(v) = row.try_get::<bool, _>(i) {
                                serde_json::Value::Bool(v)
                            } else if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(i) {
                                serde_json::Value::String(v.to_string())
                            } else if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(i) {
                                serde_json::Value::String(v.to_string())
                            } else {
                                // Fallback: try to get as string
                                row.try_get::<String, _>(i)
                                    .map(serde_json::Value::String)
                                    .unwrap_or(serde_json::Value::Null)
                            }
                        })
                        .collect()
                })
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

