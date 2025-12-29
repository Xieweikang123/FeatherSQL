// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod error;

use crate::db::connections::{create_connection, get_connections, update_connection, delete_connection, test_connection, list_databases};
use crate::db::execute::execute_sql;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_connection,
            get_connections,
            update_connection,
            delete_connection,
            test_connection,
            execute_sql,
            list_databases,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
