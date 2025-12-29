use serde::{Deserialize, Serialize};
use tauri::Manager;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub db_type: String,
    pub config: ConnectionConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ConnectionConfig {
    #[serde(rename = "sqlite")]
    Sqlite { filepath: String },
    #[serde(rename = "mysql")]
    Mysql {
        host: String,
        port: u16,
        user: String,
        password: String,
        database: Option<String>,
        ssl: bool,
    },
    #[serde(rename = "postgres")]
    Postgres {
        host: String,
        port: u16,
        user: String,
        password: String,
        database: Option<String>,
        ssl: bool,
    },
}

pub(crate) fn get_store_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("Failed to get app data directory")
        .join("connections.json")
}

pub(crate) fn load_connections(app: &tauri::AppHandle) -> Vec<Connection> {
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

pub(crate) fn save_connections(app: &tauri::AppHandle, connections: &[Connection]) -> Result<(), String> {
    let path = get_store_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    let content = serde_json::to_string_pretty(connections)
        .map_err(|e| format!("Failed to serialize connections: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn create_connection(
    name: String,
    db_type: String,
    config: serde_json::Value,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    
    let connection_config = match db_type.as_str() {
        "sqlite" => {
            let filepath = config
                .get("filepath")
                .and_then(|v| v.as_str())
                .ok_or("Missing filepath for SQLite connection")?
                .to_string();
            ConnectionConfig::Sqlite { filepath }
        }
        "mysql" => {
            let host = config
                .get("host")
                .and_then(|v| v.as_str())
                .ok_or("Missing host for MySQL connection")?
                .to_string();
            let port = config
                .get("port")
                .and_then(|v| v.as_u64())
                .ok_or("Missing port for MySQL connection")? as u16;
            let user = config
                .get("user")
                .and_then(|v| v.as_str())
                .ok_or("Missing user for MySQL connection")?
                .to_string();
            let password = config
                .get("password")
                .and_then(|v| v.as_str())
                .ok_or("Missing password for MySQL connection")?
                .to_string();
            let database = config
                .get("database")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let ssl = config.get("ssl").and_then(|v| v.as_bool()).unwrap_or(false);
            ConnectionConfig::Mysql {
                host,
                port,
                user,
                password,
                database,
                ssl,
            }
        }
        "postgres" => {
            let host = config
                .get("host")
                .and_then(|v| v.as_str())
                .ok_or("Missing host for PostgreSQL connection")?
                .to_string();
            let port = config
                .get("port")
                .and_then(|v| v.as_u64())
                .ok_or("Missing port for PostgreSQL connection")? as u16;
            let user = config
                .get("user")
                .and_then(|v| v.as_str())
                .ok_or("Missing user for PostgreSQL connection")?
                .to_string();
            let password = config
                .get("password")
                .and_then(|v| v.as_str())
                .ok_or("Missing password for PostgreSQL connection")?
                .to_string();
            let database = config
                .get("database")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let ssl = config.get("ssl").and_then(|v| v.as_bool()).unwrap_or(false);
            ConnectionConfig::Postgres {
                host,
                port,
                user,
                password,
                database,
                ssl,
            }
        }
        _ => return Err(format!("Unsupported database type: {}", db_type)),
    };

    let connection = Connection {
        id: id.clone(),
        name,
        db_type,
        config: connection_config,
    };

    let mut connections = load_connections(&app);
    connections.push(connection.clone());
    save_connections(&app, &connections)?;

    Ok(id)
}

#[tauri::command]
pub async fn get_connections(
    app: tauri::AppHandle,
) -> Result<Vec<Connection>, String> {
    Ok(load_connections(&app))
}

#[tauri::command]
pub async fn update_connection(
    id: String,
    name: Option<String>,
    config: Option<serde_json::Value>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut connections = load_connections(&app);
    
    if let Some(conn) = connections.iter_mut().find(|c| c.id == id) {
        if let Some(new_name) = name {
            conn.name = new_name;
        }
        if let Some(new_config) = config {
            // Parse config based on connection type
            let connection_config = match conn.db_type.as_str() {
                "sqlite" => {
                    let filepath = new_config
                        .get("filepath")
                        .and_then(|v| v.as_str())
                        .ok_or("Missing filepath")?
                        .to_string();
                    ConnectionConfig::Sqlite { filepath }
                }
                "mysql" => {
                    let host = new_config.get("host").and_then(|v| v.as_str()).unwrap_or("localhost").to_string();
                    let port = new_config.get("port").and_then(|v| v.as_u64()).unwrap_or(3306) as u16;
                    let user = new_config.get("user").and_then(|v| v.as_str()).unwrap_or("root").to_string();
                    let password = new_config.get("password").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let database = new_config.get("database").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let ssl = new_config.get("ssl").and_then(|v| v.as_bool()).unwrap_or(false);
                    ConnectionConfig::Mysql { host, port, user, password, database, ssl }
                }
                "postgres" => {
                    let host = new_config.get("host").and_then(|v| v.as_str()).unwrap_or("localhost").to_string();
                    let port = new_config.get("port").and_then(|v| v.as_u64()).unwrap_or(5432) as u16;
                    let user = new_config.get("user").and_then(|v| v.as_str()).unwrap_or("postgres").to_string();
                    let password = new_config.get("password").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let database = new_config.get("database").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let ssl = new_config.get("ssl").and_then(|v| v.as_bool()).unwrap_or(false);
                    ConnectionConfig::Postgres { host, port, user, password, database, ssl }
                }
                _ => return Err("Unsupported database type".to_string()),
            };
            conn.config = connection_config;
        }
    } else {
        return Err("Connection not found".to_string());
    }
    
    save_connections(&app, &connections)?;
    Ok(())
}

#[tauri::command]
pub async fn delete_connection(
    id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut connections = load_connections(&app);
    connections.retain(|c| c.id != id);
    save_connections(&app, &connections)?;

    Ok(())
}

fn get_connection_string_for_test(config: &ConnectionConfig) -> Result<String, String> {
    match config {
        ConnectionConfig::Sqlite { filepath } => {
            if !std::path::Path::new(filepath).exists() {
                return Err(format!("SQLite 文件不存在: {}", filepath));
            }
            // sqlx requires sqlite:// prefix
            Ok(format!("sqlite://{}", filepath))
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
            let ssl_param = if *ssl { "?ssl-mode=REQUIRED" } else { "?ssl-mode=DISABLED" };
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
    }
}

#[tauri::command]
pub async fn test_connection(
    db_type: String,
    config: serde_json::Value,
) -> Result<String, String> {
    let connection_config = match db_type.as_str() {
        "sqlite" => {
            let filepath = config
                .get("filepath")
                .and_then(|v| v.as_str())
                .ok_or("Missing filepath for SQLite connection")?
                .to_string();
            ConnectionConfig::Sqlite { filepath }
        }
        "mysql" => {
            let host = config
                .get("host")
                .and_then(|v| v.as_str())
                .ok_or("Missing host for MySQL connection")?
                .to_string();
            let port = config
                .get("port")
                .and_then(|v| v.as_u64())
                .ok_or("Missing port for MySQL connection")? as u16;
            let user = config
                .get("user")
                .and_then(|v| v.as_str())
                .ok_or("Missing user for MySQL connection")?
                .to_string();
            let password = config
                .get("password")
                .and_then(|v| v.as_str())
                .ok_or("Missing password for MySQL connection")?
                .to_string();
            let database = config
                .get("database")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let ssl = config.get("ssl").and_then(|v| v.as_bool()).unwrap_or(false);
            ConnectionConfig::Mysql {
                host,
                port,
                user,
                password,
                database,
                ssl,
            }
        }
        "postgres" => {
            let host = config
                .get("host")
                .and_then(|v| v.as_str())
                .ok_or("Missing host for PostgreSQL connection")?
                .to_string();
            let port = config
                .get("port")
                .and_then(|v| v.as_u64())
                .ok_or("Missing port for PostgreSQL connection")? as u16;
            let user = config
                .get("user")
                .and_then(|v| v.as_str())
                .ok_or("Missing user for PostgreSQL connection")?
                .to_string();
            let password = config
                .get("password")
                .and_then(|v| v.as_str())
                .ok_or("Missing password for PostgreSQL connection")?
                .to_string();
            let database = config
                .get("database")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let ssl = config.get("ssl").and_then(|v| v.as_bool()).unwrap_or(false);
            ConnectionConfig::Postgres {
                host,
                port,
                user,
                password,
                database,
                ssl,
            }
        }
        _ => return Err(format!("Unsupported database type: {}", db_type)),
    };

    let connection_string = get_connection_string_for_test(&connection_config)?;

    // Test the connection
    match db_type.as_str() {
        "sqlite" => {
            // For SQLite, we just check if the file exists (already done above)
            // Try to open the database to verify it's valid
            match sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect(&connection_string)
                .await
            {
                Ok(_) => Ok("SQLite 连接成功".to_string()),
                Err(e) => Err(format!("SQLite 连接失败: {}", e)),
            }
        }
        "mysql" => {
            match sqlx::mysql::MySqlPoolOptions::new()
                .max_connections(1)
                .connect(&connection_string)
                .await
            {
                Ok(pool) => {
                    // Try a simple query to verify the connection
                    match sqlx::query("SELECT 1").execute(&pool).await {
                        Ok(_) => {
                            drop(pool);
                            Ok("MySQL 连接成功".to_string())
                        }
                        Err(e) => {
                            drop(pool);
                            Err(format!("MySQL 连接测试失败: {}", e))
                        }
                    }
                }
                Err(e) => Err(format!("MySQL 连接失败: {}", e)),
            }
        }
        "postgres" => {
            match sqlx::postgres::PgPoolOptions::new()
                .max_connections(1)
                .connect(&connection_string)
                .await
            {
                Ok(pool) => {
                    // Try a simple query to verify the connection
                    match sqlx::query("SELECT 1").execute(&pool).await {
                        Ok(_) => {
                            drop(pool);
                            Ok("PostgreSQL 连接成功".to_string())
                        }
                        Err(e) => {
                            drop(pool);
                            Err(format!("PostgreSQL 连接测试失败: {}", e))
                        }
                    }
                }
                Err(e) => Err(format!("PostgreSQL 连接失败: {}", e)),
            }
        }
        _ => Err("Unsupported database type".to_string()),
    }
}

