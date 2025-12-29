use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use sqlx::Pool;
use crate::db::connections::{Connection, ConnectionConfig};

#[derive(Clone)]
pub enum DatabasePool {
    Sqlite(Pool<sqlx::Sqlite>),
    Mysql(Pool<sqlx::MySql>),
    Postgres(Pool<sqlx::Postgres>),
}

pub struct PoolManager {
    pools: Arc<RwLock<HashMap<String, DatabasePool>>>,
}

impl PoolManager {
    pub fn new() -> Self {
        Self {
            pools: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn get_or_create_pool(
        &self,
        connection: &Connection,
        database: Option<&str>,
    ) -> Result<DatabasePool, String> {
        // Create a key for the pool cache
        let key = if let Some(db) = database {
            format!("{}:{}", connection.id, db)
        } else {
            format!("{}:", connection.id)
        };

        // Try to get existing pool
        {
            let pools = self.pools.read().await;
            if let Some(pool) = pools.get(&key) {
                // Check if pool is still valid
                if Self::check_pool_health(pool).await {
                    return Ok(pool.clone());
                }
            }
        }

        // Create new pool
        let pool = Self::create_pool(connection, database).await?;

        // Cache the pool
        {
            let mut pools = self.pools.write().await;
            pools.insert(key, pool.clone());
        }

        Ok(pool)
    }

    pub async fn get_pool_without_db(&self, connection: &Connection) -> Result<DatabasePool, String> {
        self.get_or_create_pool(connection, None).await
    }

    async fn create_pool(
        connection: &Connection,
        database: Option<&str>,
    ) -> Result<DatabasePool, String> {
        match &connection.config {
            ConnectionConfig::Sqlite { filepath } => {
                let connection_string = format!("sqlite://{}", filepath);
                let pool = sqlx::sqlite::SqlitePoolOptions::new()
                    .max_connections(5)
                    .connect(&connection_string)
                    .await
                    .map_err(|e| format!("Failed to create SQLite pool: {}", e))?;
                Ok(DatabasePool::Sqlite(pool))
            }
            ConnectionConfig::Mysql {
                host,
                port,
                user,
                password,
                database: config_db,
                ssl,
            } => {
                let db_name = database.or(config_db.as_deref());
                let db_part = db_name.map(|d| format!("/{}", d)).unwrap_or_default();
                let ssl_param = if *ssl { "?ssl-mode=REQUIRED" } else { "?ssl-mode=DISABLED" };
                let connection_string = format!(
                    "mysql://{}:{}@{}:{}{}{}",
                    user, password, host, port, db_part, ssl_param
                );
                let pool = sqlx::mysql::MySqlPoolOptions::new()
                    .max_connections(5)
                    .connect(&connection_string)
                    .await
                    .map_err(|e| format!("Failed to create MySQL pool: {}", e))?;
                Ok(DatabasePool::Mysql(pool))
            }
            ConnectionConfig::Postgres {
                host,
                port,
                user,
                password,
                database: config_db,
                ssl,
            } => {
                let db_name = database.or(config_db.as_deref());
                let db_part = db_name.map(|d| format!("/{}", d)).unwrap_or_default();
                let ssl_param = if *ssl { "?sslmode=require" } else { "?sslmode=disable" };
                let connection_string = format!(
                    "postgres://{}:{}@{}:{}{}{}",
                    user, password, host, port, db_part, ssl_param
                );
                let pool = sqlx::postgres::PgPoolOptions::new()
                    .max_connections(5)
                    .connect(&connection_string)
                    .await
                    .map_err(|e| format!("Failed to create PostgreSQL pool: {}", e))?;
                Ok(DatabasePool::Postgres(pool))
            }
            ConnectionConfig::Mssql { .. } => {
                Err("MSSQL pool management not yet implemented".to_string())
            }
        }
    }

    async fn check_pool_health(pool: &DatabasePool) -> bool {
        match pool {
            DatabasePool::Sqlite(p) => {
                sqlx::query("SELECT 1").execute(p).await.is_ok()
            }
            DatabasePool::Mysql(p) => {
                sqlx::query("SELECT 1").execute(p).await.is_ok()
            }
            DatabasePool::Postgres(p) => {
                sqlx::query("SELECT 1").execute(p).await.is_ok()
            }
        }
    }

    pub async fn remove_pool(&self, connection_id: &str) {
        let mut pools = self.pools.write().await;
        // Remove all pools for this connection
        pools.retain(|k, _| !k.starts_with(&format!("{}:", connection_id)));
    }

    pub async fn clear_all(&self) {
        let mut pools = self.pools.write().await;
        pools.clear();
    }
}

