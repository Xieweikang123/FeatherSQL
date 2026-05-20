use crate::db::connections::{load_connections, ConnectionConfig};
use crate::db::history;
use crate::db::pool_manager::{DatabasePool, PoolManager};
use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use sqlx::{Column, Executor, Row};
use tauri::State;
use tiberius::{AuthMethod, Client, Config, QueryItem};
use tokio::net::TcpStream;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

/// Convert a tiberius row value to JSON value
fn mssql_value_to_json(row: &tiberius::Row, index: usize) -> serde_json::Value {
    if let Some(v) = row.try_get::<&str, _>(index).ok().flatten() {
        return serde_json::Value::String(v.to_string());
    }
    if let Some(v) = row.try_get::<bool, _>(index).ok().flatten() {
        return serde_json::Value::Bool(v);
    }
    if let Some(v) = row.try_get::<i64, _>(index).ok().flatten() {
        return serde_json::Value::Number(v.into());
    }
    if let Some(v) = row.try_get::<i32, _>(index).ok().flatten() {
        return serde_json::Value::Number(v.into());
    }
    if let Some(v) = row.try_get::<f64, _>(index).ok().flatten() {
        return serde_json::Number::from_f64(v)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null);
    }
    if let Some(v) = row.try_get::<chrono::NaiveDateTime, _>(index).ok().flatten() {
        return serde_json::Value::String(v.to_string());
    }
    if let Some(v) = row
        .try_get::<chrono::DateTime<chrono::Utc>, _>(index)
        .ok()
        .flatten()
    {
        return serde_json::Value::String(v.to_string());
    }
    if let Some(v) = row.try_get::<chrono::NaiveDate, _>(index).ok().flatten() {
        return serde_json::Value::String(v.to_string());
    }
    if let Some(v) = row.try_get::<chrono::NaiveTime, _>(index).ok().flatten() {
        return serde_json::Value::String(v.to_string());
    }
    if let Some(v) = row.try_get::<&[u8], _>(index).ok().flatten() {
        if v.len() == 16 {
            if let Ok(id) = uuid::Uuid::from_slice(v) {
                return serde_json::Value::String(id.to_string());
            }
        }
        return serde_json::Value::String(bytes_to_display(v));
    }

    serde_json::Value::Null
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
                )
                .await
            }
            _ => Err("无效的 MSSQL 配置".to_string()),
        }
    } else {
        // Get or create pool (with database if specified)
        let pool = pool_manager
            .get_or_create_pool(connection, database.as_deref())
            .await?;

        // Execute SQL based on database type
        match pool {
            DatabasePool::Sqlite(p) => execute_sql_sqlite(&p, &sql).await,
            DatabasePool::Mysql(p) => execute_sql_mysql(&p, &sql).await,
            DatabasePool::Postgres(p) => execute_sql_postgres(&p, &sql).await,
        }
    };

    // Save to history
    let rows_affected = result
        .as_ref()
        .ok()
        .and_then(|qr| extract_rows_affected(qr));
    let error_msg = result.as_ref().err().map(|e| e.clone());

    if let Err(e) = history::add_sql_history(
        connection_id.clone(),
        connection_name,
        sql,
        result.is_ok(),
        error_msg,
        rows_affected,
        app.clone(),
    )
    .await
    {
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
        query_result.rows[0].get(0).and_then(|val| match val {
            serde_json::Value::Number(n) => n.as_u64().or_else(|| n.as_i64().map(|i| i as u64)),
            _ => None,
        })
    } else {
        Some(query_result.rows.len() as u64)
    }
}

fn bytes_to_display(bytes: &[u8]) -> String {
    if bytes
        .iter()
        .all(|&b| b.is_ascii() && !b.is_ascii_control())
    {
        String::from_utf8_lossy(bytes).into_owned()
    } else {
        bytes
            .iter()
            .map(|b| format!("{:02X}", b))
            .collect::<String>()
    }
}

fn json_number_from_f64(v: f64) -> serde_json::Value {
    serde_json::Number::from_f64(v)
        .map(serde_json::Value::Number)
        .unwrap_or(serde_json::Value::Null)
}

macro_rules! row_to_json_values {
    ($row:expr, $column_count:expr) => {{
        (0..$column_count)
            .map(|i| {
                use sqlx::{Column, Row, ValueRef};
                let row = &$row;
                if row
                    .try_get_raw(i)
                    .map(|value| value.is_null())
                    .unwrap_or(true)
                {
                    serde_json::Value::Null
                } else if let Ok(v) = row.try_get::<bool, _>(i) {
                    serde_json::Value::Bool(v)
                } else if let Ok(v) = row.try_get::<i64, _>(i) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<i32, _>(i) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<i16, _>(i) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<f64, _>(i) {
                    json_number_from_f64(v)
                } else if let Ok(v) = row.try_get::<f32, _>(i) {
                    json_number_from_f64(v as f64)
                } else if let Ok(v) = row.try_get::<String, _>(i) {
                    serde_json::Value::String(v)
                } else if let Ok(v) = row.try_get::<Vec<u8>, _>(i) {
                    serde_json::Value::String(bytes_to_display(&v))
                } else if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else if let Ok(v) = row.try_get::<chrono::NaiveDate, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else if let Ok(v) = row.try_get::<chrono::NaiveTime, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else if let Ok(v) = row.try_get::<sqlx::types::Json<serde_json::Value>, _>(i) {
                    v.0
                } else if let Ok(v) = row.try_get::<uuid::Uuid, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else {
                    eprintln!(
                        "execute_sql: failed to decode column {} ({})",
                        i,
                        row.column(i).type_info()
                    );
                    serde_json::Value::Null
                }
            })
            .collect()
    }};
    ($row:expr, $column_count:expr, mysql) => {{
        (0..$column_count)
            .map(|i| {
                use sqlx::{Column, Row, ValueRef};
                let row = &$row;
                if row
                    .try_get_raw(i)
                    .map(|value| value.is_null())
                    .unwrap_or(true)
                {
                    serde_json::Value::Null
                } else if let Ok(v) = row.try_get::<bool, _>(i) {
                    serde_json::Value::Bool(v)
                } else if let Ok(v) = row.try_get::<i64, _>(i) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<u64, _>(i) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<i32, _>(i) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<u32, _>(i) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<i16, _>(i) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<u8, _>(i) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<f64, _>(i) {
                    json_number_from_f64(v)
                } else if let Ok(v) = row.try_get::<f32, _>(i) {
                    json_number_from_f64(v as f64)
                } else if let Ok(v) = row.try_get::<String, _>(i) {
                    serde_json::Value::String(v)
                } else if let Ok(v) = row.try_get::<Vec<u8>, _>(i) {
                    serde_json::Value::String(bytes_to_display(&v))
                } else if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else if let Ok(v) = row.try_get::<chrono::NaiveDate, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else if let Ok(v) = row.try_get::<chrono::NaiveTime, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else if let Ok(v) = row.try_get::<sqlx::types::Json<serde_json::Value>, _>(i) {
                    v.0
                } else if let Ok(v) = row.try_get::<uuid::Uuid, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else if let Ok(v) = row.try_get::<sqlx::types::BigDecimal, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else {
                    eprintln!(
                        "execute_sql: failed to decode column {} ({})",
                        i,
                        row.column(i).type_info()
                    );
                    serde_json::Value::Null
                }
            })
            .collect()
    }};
    ($row:expr, $column_count:expr, postgres) => {{
        (0..$column_count)
            .map(|i| {
                use sqlx::{Column, Row, ValueRef};
                let row = &$row;
                if row
                    .try_get_raw(i)
                    .map(|value| value.is_null())
                    .unwrap_or(true)
                {
                    serde_json::Value::Null
                } else if let Ok(v) = row.try_get::<bool, _>(i) {
                    serde_json::Value::Bool(v)
                } else if let Ok(v) = row.try_get::<i64, _>(i) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<i32, _>(i) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<i16, _>(i) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<f64, _>(i) {
                    json_number_from_f64(v)
                } else if let Ok(v) = row.try_get::<f32, _>(i) {
                    json_number_from_f64(v as f64)
                } else if let Ok(v) = row.try_get::<String, _>(i) {
                    serde_json::Value::String(v)
                } else if let Ok(v) = row.try_get::<Vec<u8>, _>(i) {
                    serde_json::Value::String(bytes_to_display(&v))
                } else if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else if let Ok(v) = row.try_get::<chrono::NaiveDate, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else if let Ok(v) = row.try_get::<chrono::NaiveTime, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else if let Ok(v) = row.try_get::<sqlx::types::Json<serde_json::Value>, _>(i) {
                    v.0
                } else if let Ok(v) = row.try_get::<uuid::Uuid, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else if let Ok(v) = row.try_get::<sqlx::types::BigDecimal, _>(i) {
                    serde_json::Value::String(v.to_string())
                } else {
                    eprintln!(
                        "execute_sql: failed to decode column {} ({})",
                        i,
                        row.column(i).type_info()
                    );
                    serde_json::Value::Null
                }
            })
            .collect()
    }};
}

fn columns_from_row(row: &impl Row) -> Vec<String> {
    row.columns()
        .iter()
        .map(|col| col.name().to_string())
        .collect()
}

async fn describe_sqlite_columns(conn: &mut sqlx::SqliteConnection, sql: &str) -> Vec<String> {
    conn.describe(sql)
        .await
        .map(|desc| {
            desc.columns()
                .iter()
                .map(|col| col.name().to_string())
                .collect()
        })
        .unwrap_or_default()
}

async fn describe_mysql_columns(conn: &mut sqlx::MySqlConnection, sql: &str) -> Vec<String> {
    conn.describe(sql)
        .await
        .map(|desc| {
            desc.columns()
                .iter()
                .map(|col| col.name().to_string())
                .collect()
        })
        .unwrap_or_default()
}

async fn describe_postgres_columns(conn: &mut sqlx::PgConnection, sql: &str) -> Vec<String> {
    conn.describe(sql)
        .await
        .map(|desc| {
            desc.columns()
                .iter()
                .map(|col| col.name().to_string())
                .collect()
        })
        .unwrap_or_default()
}

async fn resolve_query_columns_sqlite(
    pool: &sqlx::Pool<sqlx::Sqlite>,
    sql: &str,
    rows: &[sqlx::sqlite::SqliteRow],
) -> Vec<String> {
    if let Some(first_row) = rows.first() {
        return columns_from_row(first_row);
    }

    let Ok(mut conn) = pool.acquire().await else {
        return vec![];
    };
    describe_sqlite_columns(&mut *conn, sql).await
}

async fn resolve_query_columns_mysql(
    pool: &sqlx::Pool<sqlx::MySql>,
    sql: &str,
    rows: &[sqlx::mysql::MySqlRow],
) -> Vec<String> {
    if let Some(first_row) = rows.first() {
        return columns_from_row(first_row);
    }

    let Ok(mut conn) = pool.acquire().await else {
        return vec![];
    };
    describe_mysql_columns(&mut *conn, sql).await
}

async fn resolve_query_columns_postgres(
    pool: &sqlx::Pool<sqlx::Postgres>,
    sql: &str,
    rows: &[sqlx::postgres::PgRow],
) -> Vec<String> {
    if let Some(first_row) = rows.first() {
        return columns_from_row(first_row);
    }

    let Ok(mut conn) = pool.acquire().await else {
        return vec![];
    };
    describe_postgres_columns(&mut *conn, sql).await
}

async fn execute_sql_sqlite(
    pool: &sqlx::Pool<sqlx::Sqlite>,
    sql: &str,
) -> Result<QueryResult, String> {
    // Try to execute as a query first (SELECT statements)
    let query_result = sqlx::query(sql).fetch_all(pool).await;

    match query_result {
        Ok(rows) => {
            let columns = resolve_query_columns_sqlite(pool, sql, &rows).await;

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
                Ok(result) => Ok(QueryResult {
                    columns: vec!["affected_rows".to_string()],
                    rows: vec![vec![serde_json::Value::Number(serde_json::Number::from(
                        result.rows_affected(),
                    ))]],
                }),
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
            let columns = resolve_query_columns_mysql(pool, sql, &rows).await;

            // Convert rows to JSON values
            let json_rows: Vec<Vec<serde_json::Value>> = rows
                .iter()
                .map(|row| row_to_json_values!(row, columns.len(), mysql))
                .collect();

            Ok(QueryResult {
                columns,
                rows: json_rows,
            })
        }
        Err(_) => {
            // If query fails, try to execute as a command (INSERT, UPDATE, DELETE, etc.)
            match sqlx::query(sql).execute(pool).await {
                Ok(result) => Ok(QueryResult {
                    columns: vec!["affected_rows".to_string()],
                    rows: vec![vec![serde_json::Value::Number(serde_json::Number::from(
                        result.rows_affected(),
                    ))]],
                }),
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
            let columns = resolve_query_columns_postgres(pool, sql, &rows).await;

            // Convert rows to JSON values
            let json_rows: Vec<Vec<serde_json::Value>> = rows
                .iter()
                .map(|row| row_to_json_values!(row, columns.len(), postgres))
                .collect();

            Ok(QueryResult {
                columns,
                rows: json_rows,
            })
        }
        Err(_) => {
            // If query fails, try to execute as a command (INSERT, UPDATE, DELETE, etc.)
            match sqlx::query(sql).execute(pool).await {
                Ok(result) => Ok(QueryResult {
                    columns: vec!["affected_rows".to_string()],
                    rows: vec![vec![serde_json::Value::Number(serde_json::Number::from(
                        result.rows_affected(),
                    ))]],
                }),
                Err(e) => Err(format!("SQL execution failed: {}", e)),
            }
        }
    }
}

/// Convert LIMIT clause to TOP clause for MSSQL compatibility
/// Handles patterns like: SELECT ... LIMIT n or SELECT ... LIMIT offset, n
fn convert_limit_to_top(sql: &str) -> String {
    let sql_upper = sql.to_uppercase();

    // Find LIMIT keyword (case-insensitive)
    if let Some(limit_pos) = sql_upper.rfind(" LIMIT ") {
        let sql_before_limit = sql[..limit_pos].trim_end();

        // Check if it's a SELECT statement
        if sql_before_limit.trim().to_uppercase().starts_with("SELECT") {
            // Extract the LIMIT clause
            let limit_clause = sql[limit_pos + 7..].trim_start(); // +7 for " LIMIT "

            // Parse LIMIT value(s)
            let limit_value = if let Some(comma_pos) = limit_clause.find(',') {
                // LIMIT offset, count -> use count as TOP value
                limit_clause[comma_pos + 1..]
                    .trim()
                    .split_whitespace()
                    .next()
                    .unwrap_or("100")
            } else {
                // LIMIT count -> use count as TOP value
                limit_clause
                    .split_whitespace()
                    .next()
                    .unwrap_or("100")
                    .trim_end_matches(';')
            };

            // Find position after SELECT (handle SELECT DISTINCT/ALL) - case insensitive
            let sql_before_upper = sql_before_limit.to_uppercase();
            let after_select = if sql_before_upper.starts_with("SELECT DISTINCT ") {
                16 // "SELECT DISTINCT ".len()
            } else if sql_before_upper.starts_with("SELECT ALL ") {
                11 // "SELECT ALL ".len()
            } else if sql_before_upper.starts_with("SELECT ") {
                7 // "SELECT ".len()
            } else {
                // Fallback - find SELECT case-insensitively
                sql_before_upper.find("SELECT").map(|i| i + 7).unwrap_or(0)
            };

            // Insert TOP n right after SELECT
            format!(
                "{}TOP {} {}",
                &sql_before_limit[..after_select],
                limit_value,
                &sql_before_limit[after_select..]
            )
        } else {
            // Not a SELECT statement, return as-is
            sql.to_string()
        }
    } else {
        // No LIMIT clause found, return as-is
        sql.to_string()
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
    // Convert LIMIT to TOP for MSSQL compatibility
    let converted_sql = convert_limit_to_top(sql);

    // Create client connection using helper function
    let mut client: Client<Compat<TcpStream>> =
        create_mssql_client(host, port, user, password, database).await?;

    // Execute query
    let mut stream: tiberius::QueryStream<'_> = client
        .query(&converted_sql, &[])
        .await
        .map_err(|e| format!("SQL 执行失败: {}", e))?;

    // Collect metadata and rows
    let mut columns = Vec::new();
    let mut rows = Vec::new();

    while let Some(item) = stream
        .try_next()
        .await
        .map_err(|e| format!("读取结果失败: {}", e))?
    {
        match item {
            QueryItem::Metadata(meta) => {
                // Extract column names from metadata
                if columns.is_empty() {
                    columns = meta
                        .columns()
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
        Ok(QueryResult { columns, rows })
    }
}
