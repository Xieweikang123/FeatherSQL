use serde::{Deserialize, Serialize};
use crate::db::connections::{Connection, ConnectionConfig, load_connections};

#[derive(Debug, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
}

fn get_connection_string(connection: &Connection) -> Result<String, String> {
    match &connection.config {
        ConnectionConfig::Sqlite { filepath } => {
            Ok(format!("sqlite:{}", filepath))
        }
        ConnectionConfig::Mysql {
            host,
            port,
            user,
            password,
            database,
            ssl,
        } => {
            let db_part = database.as_ref().map(|d| format!("/{}", d)).unwrap_or_default();
            let ssl_param = if *ssl { "?ssl-mode=REQUIRED" } else { "" };
            Ok(format!(
                "mysql://{}:{}@{}:{}{}{}",
                user, password, host, port, db_part, ssl_param
            ))
        }
        ConnectionConfig::Postgres {
            host,
            port,
            user,
            password,
            database,
            ssl,
        } => {
            let db_part = database.as_ref().map(|d| format!("/{}", d)).unwrap_or_default();
            let ssl_param = if *ssl { "?sslmode=require" } else { "?sslmode=disable" };
            Ok(format!(
                "postgres://{}:{}@{}:{}{}{}",
                user, password, host, port, db_part, ssl_param
            ))
        }
        ConnectionConfig::Mssql {
            host,
            port,
            user,
            password,
            database,
            ssl: _,
        } => {
            // Note: tiberius doesn't use connection strings, but we'll format it for reference
            let db_part = database.as_ref().map(|d| format!(";database={}", d)).unwrap_or_default();
            Ok(format!(
                "mssql://{}:{}@{}:{}{}",
                user, password, host, port, db_part
            ))
        }
    }
}

#[tauri::command]
pub async fn execute_sql(
    connection_id: String,
    sql: String,
    app: tauri::AppHandle,
) -> Result<QueryResult, String> {
    // Get connection from store
    let connections = load_connections(&app);
    let connection = connections
        .into_iter()
        .find(|c| c.id == connection_id)
        .ok_or_else(|| "Connection not found".to_string())?;

    // Generate connection string
    let connection_string = get_connection_string(&connection)?;

    // TODO: Implement SQL execution using tauri-plugin-sql v2 API
    // For now, return a placeholder result
    // The actual implementation should use the plugin's API to execute SQL
    // This is a temporary implementation to allow the project to compile
    
    Err(format!(
        "SQL execution not yet implemented. Connection: {}, SQL: {}",
        connection_string,
        sql.chars().take(50).collect::<String>()
    ))
}

