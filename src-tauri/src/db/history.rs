use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use chrono::Utc;
use crate::db::settings;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SqlHistory {
    pub id: String,
    pub connection_id: String,
    pub connection_name: String,
    pub sql: String,
    pub executed_at: String, // ISO 8601 format
    pub success: bool,
    pub error_message: Option<String>,
    pub rows_affected: Option<u64>,
}

pub(crate) fn get_history_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("Failed to get app data directory")
        .join("sql_history.json")
}

pub(crate) fn load_history(app: &AppHandle) -> Vec<SqlHistory> {
    let path = get_history_path(app);
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(history) = serde_json::from_str::<Vec<SqlHistory>>(&content) {
                return history;
            }
        }
    }
    vec![]
}

pub(crate) fn save_history(app: &AppHandle, history: &[SqlHistory]) -> Result<(), String> {
    let path = get_history_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    let content = serde_json::to_string_pretty(history)
        .map_err(|e| format!("Failed to serialize history: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn add_sql_history(
    connection_id: String,
    connection_name: String,
    sql: String,
    success: bool,
    error_message: Option<String>,
    rows_affected: Option<u64>,
    app: AppHandle,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let executed_at = Utc::now().to_rfc3339();
    
    let history_item = SqlHistory {
        id: id.clone(),
        connection_id,
        connection_name,
        sql,
        executed_at,
        success,
        error_message,
        rows_affected,
    };

    let mut history = load_history(&app);
    history.insert(0, history_item); // Insert at the beginning
    
    // Get max history count from settings
    let settings = settings::load_settings(&app);
    if history.len() > settings.max_history_count {
        history.truncate(settings.max_history_count);
    }
    
    save_history(&app, &history)?;
    Ok(id)
}

#[tauri::command]
pub async fn get_sql_history(
    connection_id: Option<String>,
    limit: Option<usize>,
    app: AppHandle,
) -> Result<Vec<SqlHistory>, String> {
    let mut history = load_history(&app);
    
    // Filter by connection_id if provided
    if let Some(conn_id) = connection_id {
        history.retain(|h| h.connection_id == conn_id);
    }
    
    // Apply limit
    if let Some(limit) = limit {
        history.truncate(limit);
    }
    
    Ok(history)
}

#[tauri::command]
pub async fn delete_sql_history(
    id: Option<String>,
    app: AppHandle,
) -> Result<(), String> {
    let mut history = load_history(&app);
    
    if let Some(history_id) = id {
        // Delete specific history item
        history.retain(|h| h.id != history_id);
    } else {
        // Clear all history
        history.clear();
    }
    
    save_history(&app, &history)?;
    Ok(())
}

