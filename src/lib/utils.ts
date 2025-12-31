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
  
  // For MSSQL, if database is provided, it will be set as the connection context,
  // so we don't need to prefix the table name with database name
  // For other databases (MySQL, PostgreSQL), we add database prefix when provided
  if (database && dbType !== "sqlite" && dbType !== "mssql") {
    const escapedDb = escapeIdentifier(database, dbType);
    return `${escapedDb}.${escapedTableName}`;
  }
  
  return escapedTableName;
}

/**
 * 从 SELECT SQL 语句中提取表名和数据库名
 * @param sql SQL 语句
 * @returns 包含表名和数据库名的对象，如果无法提取则返回 null
 */
export function extractTableInfo(sql: string | null | undefined): { tableName: string; database?: string } | null {
  if (!sql) return null;
  
  // 移除注释和多余空白
  const cleaned = sql
    .replace(/--.*$/gm, '') // 移除单行注释
    .replace(/\/\*[\s\S]*?\*\//g, '') // 移除多行注释
    .trim();
  
  // 匹配 SELECT ... FROM table_name 模式，支持带引号的标识符
  // 匹配模式：FROM `db`.`table` 或 FROM "db"."table" 或 FROM [db].[table] 或 FROM table
  const fromMatch = cleaned.match(/FROM\s+((?:["`\[\]][^"`\[\]]+["`\[\]]\.)?["`\[\]]?[^"`\[\]\s(,]+["`\[\]]?)/i);
  if (fromMatch) {
    let fullName = fromMatch[1].trim();
    
    // 处理带引号的标识符（MySQL: `db`.`table`, PostgreSQL: "db"."table", MSSQL: [db].[table]）
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    
    for (let i = 0; i < fullName.length; i++) {
      const char = fullName[i];
      
      if (!inQuotes && (char === '`' || char === '"' || char === '[')) {
        inQuotes = true;
        quoteChar = char === '[' ? ']' : char;
        continue;
      }
      
      if (inQuotes && char === quoteChar) {
        inQuotes = false;
        if (current) {
          parts.push(current);
          current = '';
        }
        continue;
      }
      
      if (!inQuotes && char === '.') {
        if (current) {
          parts.push(current);
          current = '';
        }
        continue;
      }
      
      if (inQuotes || char !== '.') {
        current += char;
      }
    }
    
    if (current) {
      parts.push(current);
    }
    
    // 如果没有匹配到引号，尝试简单的点分割
    if (parts.length === 0) {
      parts.push(...fullName.split('.'));
    }
    
    // 移除每个部分的引号
    const cleanedParts = parts.map(p => p.replace(/^["`\[\]]+|["`\[\]]+$/g, '').trim()).filter(p => p);
    
    if (cleanedParts.length === 0) return null;
    
    if (cleanedParts.length === 1) {
      return { tableName: cleanedParts[0] };
    } else {
      // 第一个是数据库名，最后一个是表名
      return {
        database: cleanedParts[0],
        tableName: cleanedParts[cleanedParts.length - 1]
      };
    }
  }
  
  return null;
}

/**
 * 从 SELECT SQL 语句中提取表名（向后兼容）
 * @param sql SQL 语句
 * @returns 表名，如果无法提取则返回 null
 */
export function extractTableName(sql: string | null | undefined): string | null {
  const info = extractTableInfo(sql);
  return info?.tableName || null;
}

/**
 * 转义 SQL 值（用于防止 SQL 注入）
 * @param value 要转义的值
 * @param dbType 数据库类型
 * @returns 转义后的 SQL 值字符串
 */
export function escapeSqlValue(value: any, dbType: string): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  
  if (typeof value === 'boolean') {
    // 不同数据库的布尔值表示不同
    if (dbType === 'postgres') {
      return value ? 'TRUE' : 'FALSE';
    }
    return value ? '1' : '0';
  }
  
  if (typeof value === 'number') {
    return String(value);
  }
  
  if (typeof value === 'object') {
    // JSON 对象转换为字符串
    return escapeSqlValue(JSON.stringify(value), dbType);
  }
  
  // 字符串值：转义单引号
  const escaped = String(value).replace(/'/g, "''");
  
  // 不同数据库的字符串引号不同
  if (dbType === 'mysql' || dbType === 'mssql') {
    return `'${escaped}'`;
  }
  
  // PostgreSQL 和 SQLite 使用单引号
  return `'${escaped}'`;
}

