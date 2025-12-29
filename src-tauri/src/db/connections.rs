use serde::{Deserialize, Serialize};
use tauri::{Manager, State};
use std::fs;
use std::path::PathBuf;
use sqlx::Row;
use tiberius::{Config, AuthMethod, Client, QueryItem};
use tokio::net::TcpStream;
use tokio_util::compat::{TokioAsyncWriteCompatExt, Compat};
use futures_util::TryStreamExt;
use crate::db::pool_manager::{PoolManager, DatabasePool};

// Helper function to create MSSQL client connection
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
    #[serde(rename = "mssql")]
    Mssql {
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
        "mssql" => {
            let host = config
                .get("host")
                .and_then(|v| v.as_str())
                .ok_or("Missing host for MSSQL connection")?
                .to_string();
            let port = config
                .get("port")
                .and_then(|v| v.as_u64())
                .ok_or("Missing port for MSSQL connection")? as u16;
            let user = config
                .get("user")
                .and_then(|v| v.as_str())
                .ok_or("Missing user for MSSQL connection")?
                .to_string();
            let password = config
                .get("password")
                .and_then(|v| v.as_str())
                .ok_or("Missing password for MSSQL connection")?
                .to_string();
            let database = config
                .get("database")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let ssl = config.get("ssl").and_then(|v| v.as_bool()).unwrap_or(false);
            ConnectionConfig::Mssql {
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
    pool_manager: State<'_, PoolManager>,
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
                "mssql" => {
                    let host = new_config.get("host").and_then(|v| v.as_str()).unwrap_or("localhost").to_string();
                    let port = new_config.get("port").and_then(|v| v.as_u64()).unwrap_or(1433) as u16;
                    let user = new_config.get("user").and_then(|v| v.as_str()).unwrap_or("sa").to_string();
                    let password = new_config.get("password").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let database = new_config.get("database").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let ssl = new_config.get("ssl").and_then(|v| v.as_bool()).unwrap_or(false);
                    ConnectionConfig::Mssql { host, port, user, password, database, ssl }
                }
                _ => return Err("Unsupported database type".to_string()),
            };
            conn.config = connection_config;
            // Clear pool cache when config changes
            pool_manager.remove_pool(&id).await;
        }
    } else {
        return Err("Connection not found".to_string());
    }
    
    save_connections(&app, &connections)?;
    Ok(())
}

#[tauri::command]
pub async fn disconnect_connection(
    id: String,
    pool_manager: State<'_, PoolManager>,
) -> Result<(), String> {
    // Remove pool cache to disconnect
    pool_manager.remove_pool(&id).await;
    Ok(())
}

#[tauri::command]
pub async fn delete_connection(
    id: String,
    app: tauri::AppHandle,
    pool_manager: State<'_, PoolManager>,
) -> Result<(), String> {
    let mut connections = load_connections(&app);
    connections.retain(|c| c.id != id);
    save_connections(&app, &connections)?;
    
    // Clear pool cache when connection is deleted
    pool_manager.remove_pool(&id).await;

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
        "mssql" => {
            let host = config
                .get("host")
                .and_then(|v| v.as_str())
                .ok_or("Missing host for MSSQL connection")?
                .to_string();
            let port = config
                .get("port")
                .and_then(|v| v.as_u64())
                .ok_or("Missing port for MSSQL connection")? as u16;
            let user = config
                .get("user")
                .and_then(|v| v.as_str())
                .ok_or("Missing user for MSSQL connection")?
                .to_string();
            let password = config
                .get("password")
                .and_then(|v| v.as_str())
                .ok_or("Missing password for MSSQL connection")?
                .to_string();
            let database = config
                .get("database")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let ssl = config.get("ssl").and_then(|v| v.as_bool()).unwrap_or(false);
            ConnectionConfig::Mssql {
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

    // Test the connection
    match db_type.as_str() {
        "sqlite" => {
            let connection_string = get_connection_string_for_test(&connection_config)?;
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
            let connection_string = get_connection_string_for_test(&connection_config)?;
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
            let connection_string = get_connection_string_for_test(&connection_config)?;
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
        "mssql" => {
            match &connection_config {
                ConnectionConfig::Mssql {
                    host,
                    port,
                    user,
                    password,
                    database,
                    ssl: _,
                } => {
                    // Create tiberius config
                    let mut config = Config::new();
                    config.host(host);
                    config.port(*port);
                    config.authentication(AuthMethod::sql_server(user, password));
                    config.trust_cert(); // Trust server certificate for testing
                    if let Some(db) = database {
                        config.database(db);
                    }
                    
                    // Connect to SQL Server
                    let tcp = TcpStream::connect(config.get_addr())
                        .await
                        .map_err(|e| format!("无法连接到服务器 {}:{} - {}", host, port, e))?;
                    
                    tcp.set_nodelay(true)
                        .map_err(|e| format!("设置 TCP 选项失败: {}", e))?;
                    
                    // Create client (tiberius handles encryption internally if needed)
                    let mut client = Client::connect(config, tcp.compat_write())
                        .await
                        .map_err(|e| format!("MSSQL 连接失败: {}", e))?;
                    
                    // Execute a simple query to verify the connection
                    let mut stream = client.query("SELECT 1", &[]).await
                        .map_err(|e| format!("MSSQL 查询失败: {}", e))?;
                    
                    // Consume the stream to verify the query executed
                    while let Some(_row) = stream.try_next().await
                        .map_err(|e| format!("MSSQL 读取结果失败: {}", e))? {
                        // Just consume rows to verify connection works
                    }
                    
                    Ok("MSSQL 连接成功".to_string())
                }
                _ => Err("无效的 MSSQL 配置".to_string()),
            }
        }
        _ => Err("Unsupported database type".to_string()),
    }
}

#[tauri::command]
pub async fn list_databases(
    connection_id: String,
    app: tauri::AppHandle,
    pool_manager: State<'_, PoolManager>,
) -> Result<Vec<String>, String> {
    let connections = load_connections(&app);
    let connection = connections
        .into_iter()
        .find(|c| c.id == connection_id)
        .ok_or_else(|| "Connection not found".to_string())?;

    // For SQLite, return empty list as it's a file-based database
    if connection.db_type == "sqlite" {
        return Ok(vec![]);
    }

    // Handle MSSQL separately since it uses tiberius instead of sqlx
    if connection.db_type == "mssql" {
        match &connection.config {
            ConnectionConfig::Mssql {
                host,
                port,
                user,
                password,
                database: _,
                ssl: _,
            } => {
                // Connect without specific database to list all databases
                let mut client: Client<Compat<TcpStream>> = create_mssql_client(host, *port, user, password, None).await?;
                
                // Query databases (exclude system databases with database_id <= 4)
                let mut stream: tiberius::QueryStream<'_> = client.query(
                    "SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name",
                    &[]
                ).await
                    .map_err(|e| format!("查询数据库列表失败: {}", e))?;
                
                let mut databases = Vec::new();
                while let Some(item) = stream.try_next().await
                    .map_err(|e| format!("读取结果失败: {}", e))? {
                    if let QueryItem::Row(row) = item {
                        if let Some(name) = row.try_get::<&str, _>(0).ok().flatten() {
                            databases.push(name.to_string());
                        }
                    }
                }
                
                return Ok(databases);
            }
            _ => return Err("无效的 MSSQL 配置".to_string()),
        }
    }

    // Get or create pool (without database name)
    let pool = pool_manager.get_pool_without_db(&connection).await?;

    // Query databases
    match pool {
        DatabasePool::Mysql(p) => {
            let result = sqlx::query("SHOW DATABASES")
                .fetch_all(&p)
                .await
                .map_err(|e| format!("Failed to list databases: {}", e))?;
            
            let databases: Vec<String> = result
                .into_iter()
                .map(|row| row.get::<String, _>(0))
                .collect();
            
            Ok(databases)
        }
        DatabasePool::Postgres(p) => {
            let result = sqlx::query("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname")
                .fetch_all(&p)
                .await
                .map_err(|e| format!("Failed to list databases: {}", e))?;
            
            let databases: Vec<String> = result
                .into_iter()
                .map(|row| row.get::<String, _>(0))
                .collect();
            
            Ok(databases)
        }
        _ => Ok(vec![]),
    }
}

#[tauri::command]
pub async fn list_tables(
    connection_id: String,
    database: Option<String>,
    app: tauri::AppHandle,
    pool_manager: State<'_, PoolManager>,
) -> Result<Vec<String>, String> {
    let connections = load_connections(&app);
    let connection = connections
        .into_iter()
        .find(|c| c.id == connection_id)
        .ok_or_else(|| "Connection not found".to_string())?;

    // Handle MSSQL separately since it uses tiberius instead of sqlx
    if connection.db_type == "mssql" {
        match &connection.config {
            ConnectionConfig::Mssql {
                host,
                port,
                user,
                password,
                database: config_db,
                ssl: _,
            } => {
                // Use specified database or config database
                let db_name = database.as_deref().or(config_db.as_deref());
                
                // Create client connection
                let mut client: Client<Compat<TcpStream>> = create_mssql_client(host, *port, user, password, db_name).await?;
                
                // Query tables from information_schema (optimized query)
                let query = if let Some(db) = db_name {
                    format!(
                        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_CATALOG = '{}' ORDER BY TABLE_NAME",
                        db.replace("'", "''")
                    )
                } else {
                    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME".to_string()
                };
                
                let mut stream: tiberius::QueryStream<'_> = client.query(&query, &[])
                    .await
                    .map_err(|e| format!("查询表列表失败: {}", e))?;
                
                let mut tables = Vec::new();
                while let Some(item) = stream.try_next().await
                    .map_err(|e| format!("读取结果失败: {}", e))? {
                    if let QueryItem::Row(row) = item {
                        if let Some(name) = row.try_get::<&str, _>(0).ok().flatten() {
                            tables.push(name.to_string());
                        }
                    }
                }
                
                return Ok(tables);
            }
            _ => return Err("无效的 MSSQL 配置".to_string()),
        }
    }

    // Get or create pool (with database if specified)
    let pool = pool_manager.get_or_create_pool(&connection, database.as_deref()).await?;

    // Query tables
    match pool {
        DatabasePool::Sqlite(p) => {
            let result = sqlx::query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
                .fetch_all(&p)
                .await
                .map_err(|e| format!("Failed to list tables: {}", e))?;
            
            let tables: Vec<String> = result
                .into_iter()
                .map(|row| row.get::<String, _>(0))
                .collect();
            
            Ok(tables)
        }
        DatabasePool::Mysql(p) => {
            // Use SHOW TABLES query
            let query = if let Some(db) = database.as_ref() {
                format!("SHOW TABLES FROM `{}`", db.replace("`", "``"))
            } else {
                "SHOW TABLES".to_string()
            };
            
            let result = sqlx::query(&query)
                .fetch_all(&p)
                .await
                .map_err(|e| format!("Failed to list tables: {}", e))?;
            
            let tables: Vec<String> = result
                .into_iter()
                .map(|row| row.get::<String, _>(0))
                .collect();
            
            Ok(tables)
        }
        DatabasePool::Postgres(p) => {
            // Query tables from information_schema
            let result = sqlx::query(
                "SELECT table_name FROM information_schema.tables 
                 WHERE table_schema = 'public' 
                 AND table_type = 'BASE TABLE'
                 ORDER BY table_name"
            )
                .fetch_all(&p)
                .await
                .map_err(|e| format!("Failed to list tables: {}", e))?;
            
            let tables: Vec<String> = result
                .into_iter()
                .map(|row| row.get::<String, _>(0))
                .collect();
            
            Ok(tables)
        }
    }
}

