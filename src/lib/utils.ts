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

/** 列名 -> SHOW COLUMNS / information_schema 中的 data_type */
export type ColumnTypeMap = Record<string, string>;

function isNumericSqlType(dataType: string): boolean {
  const t = dataType.toLowerCase();
  return /^(tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real|bit)/.test(
    t
  );
}

function isBooleanSqlType(dataType: string): boolean {
  const t = dataType.toLowerCase();
  return (
    t.includes("bool") ||
    /^bit\(1\)/.test(t) ||
    /^tinyint\(1\)/.test(t)
  );
}

/**
 * 按列类型将编辑/粘贴后的值（常为字符串）转换为适合写入 SQL 的标量
 */
export function coerceValueForColumn(
  value: unknown,
  columnDataType?: string
): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (!columnDataType) {
    return value;
  }

  const numeric = isNumericSqlType(columnDataType);
  const boolean = isBooleanSqlType(columnDataType);

  if (typeof value === "boolean") {
    if (numeric && !boolean) {
      return value ? 1 : 0;
    }
    return value;
  }

  if (typeof value === "string") {
    const s = value.trim();
    if (s === "") {
      return null;
    }
    if (boolean || numeric) {
      const lower = s.toLowerCase();
      if (lower === "true") {
        return boolean ? true : 1;
      }
      if (lower === "false") {
        return boolean ? false : 0;
      }
    }
    if (numeric && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) {
      return s.includes(".") || /[eE]/.test(s) ? parseFloat(s) : parseInt(s, 10);
    }
  }

  return value;
}

/**
 * 转义 SQL 值（用于防止 SQL 注入）
 * @param value 要转义的值
 * @param dbType 数据库类型
 * @param columnDataType 可选，列 data_type，用于将 "true" 等转为数值/布尔字面量
 * @returns 转义后的 SQL 值字符串
 */
export function escapeSqlValue(
  value: any,
  dbType: string,
  columnDataType?: string
): string {
  const coerced = coerceValueForColumn(value, columnDataType);

  if (coerced === null || coerced === undefined) {
    return 'NULL';
  }
  
  if (typeof coerced === 'boolean') {
    // 不同数据库的布尔值表示不同
    if (dbType === 'postgres') {
      return coerced ? 'TRUE' : 'FALSE';
    }
    return coerced ? '1' : '0';
  }
  
  if (typeof coerced === 'number') {
    if (!Number.isFinite(coerced)) {
      return 'NULL';
    }
    return String(coerced);
  }
  
  if (typeof coerced === 'object') {
    // JSON 对象转换为字符串
    return escapeSqlValue(JSON.stringify(coerced), dbType);
  }
  
  // 字符串值：转义单引号
  const escaped = String(coerced).replace(/'/g, "''");
  
  // 不同数据库的字符串引号不同
  if (dbType === 'mysql' || dbType === 'mssql') {
    return `'${escaped}'`;
  }
  
  // PostgreSQL 和 SQLite 使用单引号
  return `'${escaped}'`;
}

