use serde::{Deserialize, Serialize};
use tauri::State;
use tauri_plugin_store::{with_store, StoreCollection};
use db::connections::{Connection, ConnectionConfig};

const STORE_PATH: &str = "connections.json";

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
    stores: State<'_, StoreCollection<tauri::Wry>>,
    app: tauri::AppHandle,
) -> Result<QueryResult, String> {
    // Get connection from store
    let connection: Connection = with_store(
        app.clone(),
        stores,
        STORE_PATH,
        |store| {
            let connections: Vec<Connection> = store
                .get("connections")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();
            
            connections
                .into_iter()
                .find(|c| c.id == connection_id)
                .ok_or_else(|| "Connection not found".to_string())
        },
    )
    .map_err(|e| e.to_string())??;

    // Generate connection string
    let connection_string = get_connection_string(&connection)?;

    // Use tauri-plugin-sql API
    // For Tauri v2, we use the plugin's direct API
    let db = tauri_plugin_sql::DbInstance::load(&app, &connection_string)
        .await
        .map_err(|e| format!("Failed to load database: {}", e))?;

    // Check if it's a SELECT query
    let is_select = sql.trim_start().to_uppercase().starts_with("SELECT");

    if is_select {
        // For SELECT queries, use the select method
        let result = db
            .select(&sql, &[])
            .await
            .map_err(|e| format!("Query error: {}", e))?;

        // Extract columns from first row if available
        let columns = if let Some(first_row) = result.first() {
            if let Some(obj) = first_row.as_object() {
                obj.keys().cloned().collect()
            } else {
                vec![]
            }
        } else {
            vec![]
        };

        // Convert rows to Vec<Vec<Value>>
        let rows: Vec<Vec<serde_json::Value>> = result
            .into_iter()
            .map(|row| {
                if let Some(obj) = row.as_object() {
                    obj.values().cloned().collect()
                } else {
                    vec![row]
                }
            })
            .collect();

        Ok(QueryResult { columns, rows })
    } else {
        // For non-SELECT queries (INSERT, UPDATE, DELETE, etc.)
        let result = db
            .execute(&sql, &[])
            .await
            .map_err(|e| format!("Execution error: {}", e))?;

        Ok(QueryResult {
            columns: vec!["affected_rows".to_string()],
            rows: vec![vec![serde_json::Value::Number(
                serde_json::Number::from(result as u64),
            )]],
        })
    }
}

