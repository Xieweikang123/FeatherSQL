/**
 * 转义数据库标识符（表名、数据库名）以用于 SQL 查询
 * @param identifier 标识符名称
 * @param dbType 数据库类型
 * @returns 转义后的标识符
 */
export function escapeIdentifier(identifier: string, dbType: string): string {
  if (dbType === "mysql") {
    return `\`${identifier.replace(/`/g, "``")}\``;
  } else if (dbType === "postgres") {
    return `"${identifier.replace(/"/g, '""')}"`;
  } else if (dbType === "mssql") {
    return `[${identifier.replace(/\]/g, "]]")}]`;
  }
  // SQLite 和其他类型不需要转义
  return identifier;
}

/**
 * 构建完整的表名（包含数据库前缀，如果需要）
 * @param tableName 表名
 * @param dbType 数据库类型
 * @param database 数据库名（可选）
 * @returns 转义后的完整表名
 */
export function buildTableName(tableName: string, dbType: string, database?: string | null): string {
  const escapedTableName = escapeIdentifier(tableName, dbType);
  
  if (database && dbType !== "sqlite") {
    const escapedDb = escapeIdentifier(database, dbType);
    return `${escapedDb}.${escapedTableName}`;
  }
  
  return escapedTableName;
}

