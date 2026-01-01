import { extractTableInfo, escapeIdentifier, escapeSqlValue, buildTableName } from "../lib/utils";
import type { QueryResult, Connection } from "../lib/commands";
import type { CellModification } from "../hooks/useEditHistory";

/**
 * 构建带 WHERE 条件和 ORDER BY 的 SQL
 */
export function buildFilteredAndSortedSql(
  baseSql: string,
  filters: Record<string, string>,
  sortConfig: Array<{ column: string; direction: 'asc' | 'desc' }>,
  dbType: string
): string {
  if (!baseSql) return baseSql;
  
  // 移除注释和多余空白
  const cleaned = baseSql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
  
  let sql = cleaned;
  
  // 1. 处理 WHERE 条件
  const activeFilters = Object.entries(filters).filter(([_, value]) => value.trim() !== "");
  if (activeFilters.length > 0) {
    const hasWhere = /\bWHERE\b/i.test(sql);
    const conditions: string[] = [];
    
    activeFilters.forEach(([columnName, filterValue]) => {
      const escapedColumn = escapeIdentifier(columnName, dbType);
      const escapedValue = escapeSqlValue(`%${filterValue}%`, dbType);
      
      // 使用 LIKE 进行模糊匹配（不区分大小写）
      if (dbType === 'postgres') {
        conditions.push(`LOWER(${escapedColumn}::text) LIKE LOWER(${escapedValue})`);
      } else if (dbType === 'mssql') {
        conditions.push(`${escapedColumn} LIKE ${escapedValue} COLLATE SQL_Latin1_General_CP1_CI_AS`);
      } else {
        // MySQL 和 SQLite
        conditions.push(`LOWER(${escapedColumn}) LIKE LOWER(${escapedValue})`);
      }
    });
    
    const whereClause = conditions.join(' AND ');
    
    if (hasWhere) {
      // 如果已有 WHERE，在 WHERE 后面添加 AND 条件
      const whereMatch = sql.match(/\bWHERE\b/i);
      if (whereMatch && whereMatch.index !== undefined) {
        const whereIndex = whereMatch.index + whereMatch[0].length;
        sql = sql.slice(0, whereIndex) + ` AND (${whereClause})` + sql.slice(whereIndex);
      } else {
        sql = sql.replace(/\bWHERE\b/i, `WHERE (${whereClause}) AND`);
      }
    } else {
      // 如果没有 WHERE，添加 WHERE 子句
      // 找到 ORDER BY, GROUP BY, HAVING, LIMIT 等子句的位置
      const orderByMatch = sql.match(/\bORDER\s+BY\b/i);
      const groupByMatch = sql.match(/\bGROUP\s+BY\b/i);
      const havingMatch = sql.match(/\bHAVING\b/i);
      const limitMatch = sql.match(/\bLIMIT\b/i);
      
      let insertPosition = sql.length;
      if (orderByMatch) insertPosition = Math.min(insertPosition, orderByMatch.index || sql.length);
      if (groupByMatch) insertPosition = Math.min(insertPosition, groupByMatch.index || sql.length);
      if (havingMatch) insertPosition = Math.min(insertPosition, havingMatch.index || sql.length);
      if (limitMatch) insertPosition = Math.min(insertPosition, limitMatch.index || sql.length);
      
      sql = sql.slice(0, insertPosition).trim() + ` WHERE ${whereClause} ` + sql.slice(insertPosition);
    }
  }
  
  // 2. 处理 ORDER BY 子句
  if (sortConfig.length > 0) {
    // 构建 ORDER BY 子句
    const orderByClause = sortConfig
      .map(({ column, direction }) => {
        const escapedColumn = escapeIdentifier(column, dbType);
        return `${escapedColumn} ${direction.toUpperCase()}`;
      })
      .join(', ');
    
    // 检查是否已经有 ORDER BY 子句
    const orderByMatch = sql.match(/\bORDER\s+BY\b/i);
    if (orderByMatch) {
      // 如果已有 ORDER BY，替换它
      const orderByIndex = orderByMatch.index || 0;
      // 找到 ORDER BY 子句的结束位置（下一个关键字或 SQL 结束）
      const afterOrderBy = sql.slice(orderByIndex + orderByMatch[0].length);
      const nextKeywordMatch = afterOrderBy.match(/\b(LIMIT|OFFSET|FETCH)\b/i);
      const orderByEnd = nextKeywordMatch 
        ? orderByIndex + orderByMatch[0].length + (nextKeywordMatch.index || 0)
        : sql.length;
      
      sql = sql.slice(0, orderByIndex) + `ORDER BY ${orderByClause} ` + sql.slice(orderByEnd);
    } else {
      // 如果没有 ORDER BY，添加它
      // 找到 LIMIT, OFFSET, FETCH 等子句的位置
      const limitMatch = sql.match(/\bLIMIT\b/i);
      const offsetMatch = sql.match(/\bOFFSET\b/i);
      const fetchMatch = sql.match(/\bFETCH\b/i);
      
      let insertPosition = sql.length;
      if (limitMatch) insertPosition = Math.min(insertPosition, limitMatch.index || sql.length);
      if (offsetMatch) insertPosition = Math.min(insertPosition, offsetMatch.index || sql.length);
      if (fetchMatch) insertPosition = Math.min(insertPosition, fetchMatch.index || sql.length);
      
      sql = sql.slice(0, insertPosition).trim() + ` ORDER BY ${orderByClause}` + sql.slice(insertPosition);
    }
  }
  
  return sql;
}

/**
 * 构建带 WHERE 条件的 SQL（保持向后兼容）
 */
export function buildFilteredSql(
  baseSql: string,
  filters: Record<string, string>,
  dbType: string
): string {
  if (!baseSql) return baseSql;
  
  const activeFilters = Object.entries(filters).filter(([_, value]) => value.trim() !== "");
  if (activeFilters.length === 0) return baseSql;

  // 移除注释和多余空白
  const cleaned = baseSql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  // 检查是否已经有 WHERE 子句
  const hasWhere = /\bWHERE\b/i.test(cleaned);
  
  // 构建 WHERE 条件
  const conditions: string[] = [];
  
  activeFilters.forEach(([columnName, filterValue]) => {
    const escapedColumn = escapeIdentifier(columnName, dbType);
    const escapedValue = escapeSqlValue(`%${filterValue}%`, dbType);
    
    // 使用 LIKE 进行模糊匹配（不区分大小写）
    if (dbType === 'postgres') {
      conditions.push(`LOWER(${escapedColumn}::text) LIKE LOWER(${escapedValue})`);
    } else if (dbType === 'mssql') {
      conditions.push(`${escapedColumn} LIKE ${escapedValue} COLLATE SQL_Latin1_General_CP1_CI_AS`);
    } else {
      // MySQL 和 SQLite
      conditions.push(`LOWER(${escapedColumn}) LIKE LOWER(${escapedValue})`);
    }
  });

  if (conditions.length === 0) return baseSql;

  const whereClause = conditions.join(' AND ');
  
  if (hasWhere) {
    // 如果已有 WHERE，在 WHERE 后面添加 AND 条件
    // 找到 WHERE 关键字的位置
    const whereMatch = cleaned.match(/\bWHERE\b/i);
    if (whereMatch && whereMatch.index !== undefined) {
      const whereIndex = whereMatch.index + whereMatch[0].length;
      // 在 WHERE 后面添加 AND 条件
      return cleaned.slice(0, whereIndex) + ` AND (${whereClause})` + cleaned.slice(whereIndex);
    }
    // 如果找不到 WHERE 位置，回退到简单替换
    return cleaned.replace(/\bWHERE\b/i, `WHERE (${whereClause}) AND`);
  } else {
    // 如果没有 WHERE，添加 WHERE 子句
    // 找到 ORDER BY, GROUP BY, LIMIT 等子句的位置
    const orderByMatch = cleaned.match(/\bORDER\s+BY\b/i);
    const groupByMatch = cleaned.match(/\bGROUP\s+BY\b/i);
    const havingMatch = cleaned.match(/\bHAVING\b/i);
    const limitMatch = cleaned.match(/\bLIMIT\b/i);
    
    let insertPosition = cleaned.length;
    if (orderByMatch) insertPosition = Math.min(insertPosition, orderByMatch.index || cleaned.length);
    if (groupByMatch) insertPosition = Math.min(insertPosition, groupByMatch.index || cleaned.length);
    if (havingMatch) insertPosition = Math.min(insertPosition, havingMatch.index || cleaned.length);
    if (limitMatch) insertPosition = Math.min(insertPosition, limitMatch.index || cleaned.length);
    
    return cleaned.slice(0, insertPosition).trim() + ` WHERE ${whereClause} ` + cleaned.slice(insertPosition);
  }
}

/**
 * 生成 UPDATE SQL 语句（基于修改记录）
 */
export function generateUpdateSql(
  modifications: Map<string, CellModification>,
  sql: string,
  result: QueryResult,
  currentConnection: Connection,
  currentDatabase: string | null
): string[] {
  if (modifications.size === 0 || !sql || !currentConnection) return [];
  
  const tableInfo = extractTableInfo(sql);
  if (!tableInfo || !tableInfo.tableName) {
    throw new Error("无法从 SQL 中提取表名，请确保 SQL 是 SELECT ... FROM table_name 格式");
  }
  
  const dbType = currentConnection.type;
  // 如果 SQL 中指定了数据库名，使用 SQL 中的；否则使用当前选择的数据库
  const databaseToUse = tableInfo.database || currentDatabase;
  const escapedTableName = buildTableName(tableInfo.tableName, dbType, databaseToUse);
  
  // 按行分组修改
  const rowMods = new Map<number, Map<string, any>>();
  
  modifications.forEach((mod) => {
    if (!rowMods.has(mod.rowIndex)) {
      rowMods.set(mod.rowIndex, new Map());
    }
    rowMods.get(mod.rowIndex)!.set(mod.column, mod.newValue);
  });
  
  // 生成 UPDATE 语句
  const sqls: string[] = [];
  
  rowMods.forEach((columns, rowIndex) => {
    // SET 子句
    const setClause = Array.from(columns.entries())
      .map(([col, val]) => {
        const escapedCol = escapeIdentifier(col, dbType);
        const escapedVal = escapeSqlValue(val, dbType);
        return `${escapedCol} = ${escapedVal}`;
      })
      .join(', ');
    
    // WHERE 子句：使用所有列的原始值来定位行
    // 注意：这不是最理想的方式，但可以在没有主键的情况下工作
    const whereConditions: string[] = [];
    const originalRow = result.rows[rowIndex];
    
    result.columns.forEach((col, colIndex) => {
      const escapedCol = escapeIdentifier(col, dbType);
      const originalValue = originalRow[colIndex];
      
      // 处理 NULL 值
      if (originalValue === null || originalValue === undefined) {
        whereConditions.push(`${escapedCol} IS NULL`);
      } else {
        const escapedVal = escapeSqlValue(originalValue, dbType);
        whereConditions.push(`${escapedCol} = ${escapedVal}`);
      }
    });
    
    const whereClause = whereConditions.join(' AND ');
    
    sqls.push(`UPDATE ${escapedTableName} SET ${setClause} WHERE ${whereClause};`);
  });
  
  return sqls;
}

/**
 * 生成 INSERT SQL 语句（基于选中的行）
 */
export function generateInsertSql(
  selectedRows: Set<number>,
  sql: string,
  editedData: QueryResult,
  displayColumns: string[],
  currentConnection: Connection,
  currentDatabase: string | null
): string | null {
  if (!sql || !currentConnection || selectedRows.size === 0) return null;
  
  const tableInfo = extractTableInfo(sql);
  if (!tableInfo || !tableInfo.tableName) {
    return null;
  }
  
  const dbType = currentConnection.type;
  const databaseToUse = tableInfo.database || currentDatabase;
  const escapedTableName = buildTableName(tableInfo.tableName, dbType, databaseToUse);
  
  // 获取所有选中的行
  const selectedRowIndices = Array.from(selectedRows).sort((a, b) => a - b);
  
  if (selectedRowIndices.length === 0) return null;
  
  // 构建列名列表
  const columnNames = displayColumns.map(col => escapeIdentifier(col, dbType));
  const columnsClause = columnNames.join(', ');
  
  // 为每行生成 VALUES 子句
  const valuesClauses: string[] = [];
  for (const rowIndex of selectedRowIndices) {
    if (rowIndex >= editedData.rows.length) continue;
    
    const row = editedData.rows[rowIndex];
    const values = row.map(val => escapeSqlValue(val, dbType));
    valuesClauses.push(`(${values.join(', ')})`);
  }
  
  if (valuesClauses.length === 0) return null;
  
  const insertSql = `INSERT INTO ${escapedTableName} (${columnsClause}) VALUES\n${valuesClauses.join(',\n')};`;
  return insertSql;
}

/**
 * 生成 UPDATE SQL 语句（基于选中的行）
 */
export function generateUpdateSqlForRows(
  selectedRows: Set<number>,
  sql: string,
  editedData: QueryResult,
  result: QueryResult,
  displayColumns: string[],
  currentConnection: Connection,
  currentDatabase: string | null
): string | null {
  if (!sql || !currentConnection || selectedRows.size === 0) return null;
  
  const tableInfo = extractTableInfo(sql);
  if (!tableInfo || !tableInfo.tableName) {
    return null;
  }
  
  const dbType = currentConnection.type;
  const databaseToUse = tableInfo.database || currentDatabase;
  const escapedTableName = buildTableName(tableInfo.tableName, dbType, databaseToUse);
  
  // 获取所有选中的行
  const selectedRowIndices = Array.from(selectedRows).sort((a, b) => a - b);
  
  if (selectedRowIndices.length === 0) return null;
  
  // 为每行生成 UPDATE 语句
  const sqls: string[] = [];
  
  for (const rowIndex of selectedRowIndices) {
    if (rowIndex >= editedData.rows.length) continue;
    
    const row = editedData.rows[rowIndex];
    const originalRow = result.rows[rowIndex];
    
    // 构建 SET 子句（使用当前行的所有值）
    const setClause = displayColumns.map((col, colIndex) => {
      const escapedCol = escapeIdentifier(col, dbType);
      const val = row[colIndex];
      const escapedVal = escapeSqlValue(val, dbType);
      return `${escapedCol} = ${escapedVal}`;
    }).join(', ');
    
    // 构建 WHERE 子句（使用原始行的所有值来定位）
    const whereConditions: string[] = [];
    displayColumns.forEach((col, colIndex) => {
      const escapedCol = escapeIdentifier(col, dbType);
      const originalValue = originalRow[colIndex];
      
      if (originalValue === null || originalValue === undefined) {
        whereConditions.push(`${escapedCol} IS NULL`);
      } else {
        const escapedVal = escapeSqlValue(originalValue, dbType);
        whereConditions.push(`${escapedCol} = ${escapedVal}`);
      }
    });
    
    const whereClause = whereConditions.join(' AND ');
    sqls.push(`UPDATE ${escapedTableName} SET ${setClause} WHERE ${whereClause};`);
  }
  
  return sqls.join('\n\n');
}

