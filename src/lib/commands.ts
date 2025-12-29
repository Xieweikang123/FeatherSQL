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
  sql: string
): Promise<QueryResult> {
  return await invoke("execute_sql", { connectionId, sql });
}

// List databases command
export async function listDatabases(connectionId: string): Promise<string[]> {
  return await invoke("list_databases", { connectionId });
}

