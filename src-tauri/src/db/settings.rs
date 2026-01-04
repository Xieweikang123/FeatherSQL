use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default = "default_max_history_count")]
    pub max_history_count: usize,
}

fn default_max_history_count() -> usize {
    1000
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            max_history_count: 1000,
        }
    }
}

pub(crate) fn get_settings_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("Failed to get app data directory")
        .join("settings.json")
}

pub(crate) fn load_settings(app: &AppHandle) -> AppSettings {
    let path = get_settings_path(app);
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
                return settings;
            }
        }
    }
    AppSettings::default()
}

pub(crate) fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = get_settings_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    Ok(load_settings(&app))
}

#[tauri::command]
pub async fn update_settings(
    max_history_count: Option<usize>,
    app: AppHandle,
) -> Result<AppSettings, String> {
    let mut settings = load_settings(&app);
    
    if let Some(count) = max_history_count {
        // Validate: must be between 1 and 100000
        if count < 1 || count > 100000 {
            return Err("最大历史记录数必须在 1 到 100000 之间".to_string());
        }
        settings.max_history_count = count;
    }
    
    save_settings(&app, &settings)?;
    Ok(settings)
}

