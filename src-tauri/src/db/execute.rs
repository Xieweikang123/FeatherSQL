use serde::{Deserialize, Serialize};
use tauri::Manager;
use crate::db::connections::{Connection, ConnectionConfig};

use std::fs;
use std::path::PathBuf;

fn get_store_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("Failed to get app data directory")
        .join("connections.json")
}

fn load_connections(app: &tauri::AppHandle) -> Vec<Connection> {
    let path = get_store_path(app);
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(connections) = serde_json::from_str::<Vec<Connection>>(&content) {
                return connections;
            }
        }
    }
    vec![]
}

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
            let ssl_param = if *ssl { "?ssl-mode=REQUIRED" } else { "" };
            Ok(format!(
                "mysql://{}:{}@{}:{}/{}{}",
                user, password, host, port, database, ssl_param
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
            let ssl_param = if *ssl { "?sslmode=require" } else { "?sslmode=disable" };
            Ok(format!(
                "postgres://{}:{}@{}:{}/{}{}",
                user, password, host, port, database, ssl_param
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

