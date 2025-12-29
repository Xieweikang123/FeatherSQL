// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod error;

use crate::db::connections::{create_connection, get_connections, update_connection, delete_connection, test_connection, list_databases, list_tables};
use crate::db::execute::execute_sql;
use crate::db::pool_manager::PoolManager;
use crate::db::history::{add_sql_history, get_sql_history, delete_sql_history};
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize pool manager
            let pool_manager = PoolManager::new();
            app.manage(pool_manager);
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
            list_tables,
            add_sql_history,
            get_sql_history,
            delete_sql_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
