import { invoke } from "@tauri-apps/api/core";

export interface Connection {
  id: string;
  name: string;
  type: string;
  config: ConnectionConfig;
}

export interface ConnectionConfig {
  type?: string;
  filepath?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
}

export interface QueryResult {
  columns: string[];
  rows: any[][];
}

// Connection management commands
export async function createConnection(
  name: string,
  dbType: string,
  config: ConnectionConfig
): Promise<string> {
  return await invoke("create_connection", { name, dbType, config });
}

export async function getConnections(): Promise<Connection[]> {
  return await invoke("get_connections");
}

export async function updateConnection(
  id: string,
  name?: string,
  config?: ConnectionConfig
): Promise<void> {
  return await invoke("update_connection", { id, name, config });
}

export async function disconnectConnection(id: string): Promise<void> {
  return await invoke("disconnect_connection", { id });
}

export async function deleteConnection(id: string): Promise<void> {
  return await invoke("delete_connection", { id });
}

export async function testConnection(
  dbType: string,
  config: ConnectionConfig
): Promise<string> {
  return await invoke("test_connection", { dbType, config });
}

// SQL execution command
export async function executeSql(
  connectionId: string,
  sql: string,
  database?: string
): Promise<QueryResult> {
  return await invoke("execute_sql", { connectionId, sql, database });
}

// List databases command
export async function listDatabases(connectionId: string): Promise<string[]> {
  return await invoke("list_databases", { connectionId });
}

// List tables command
export async function listTables(connectionId: string, database?: string): Promise<string[]> {
  return await invoke("list_tables", { connectionId, database });
}

// Table structure command
export interface ColumnInfo {
  name: string;
  data_type: string;
  nullable: boolean;
  default: string | null;
  primary_key: boolean;
  auto_increment: boolean;
}

export async function describeTable(
  connectionId: string,
  tableName: string,
  database?: string
): Promise<ColumnInfo[]> {
  return await invoke("describe_table", { connectionId, tableName, database });
}

// SQL History commands
export interface SqlHistory {
  id: string;
  connection_id: string;
  connection_name: string;
  sql: string;
  executed_at: string;
  success: boolean;
  error_message?: string;
  rows_affected?: number;
}

export async function getSqlHistory(
  connectionId?: string,
  limit?: number
): Promise<SqlHistory[]> {
  return await invoke("get_sql_history", { connectionId, limit });
}

export async function deleteSqlHistory(id?: string): Promise<void> {
  return await invoke("delete_sql_history", { id });
}

// Settings commands
export interface AppSettings {
  max_history_count: number;
}

export async function getSettings(): Promise<AppSettings> {
  return await invoke("get_settings");
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  return await invoke("update_settings", { 
    max_history_count: settings.max_history_count 
  });
}

