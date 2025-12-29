// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod storage;

use db::{connections, execute};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            // Connection management commands
            connections::create_connection,
            connections::get_connections,
            connections::update_connection,
            connections::delete_connection,
            // SQL execution commands
            execute::execute_sql,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

