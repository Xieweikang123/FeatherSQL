import { extractTableInfo, escapeIdentifier, escapeSqlValue, buildTableName } from "../lib/utils";
import type { QueryResult, Connection } from "../lib/commands";
import type { CellModification } from "../hooks/useEditHistory";

/**
 * 构建带 WHERE 条件和 ORDER BY 的 SQL
 * @param filterModes 列过滤模式：'fuzzy' 模糊匹配 LIKE %value%，'exact' 精确匹配 = value
 */
export function buildFilteredAndSortedSql(
  baseSql: string,
  filters: Record<string, string>,
  sortConfig: Array<{ column: string; direction: 'asc' | 'desc' }>,
  dbType: string,
  filterModes?: Record<string, 'fuzzy' | 'exact'>
): string {
  if (!baseSql) return baseSql;
  
  const cleaned = baseSql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
  
  let sql = cleaned;
  
  const activeFilters = Object.entries(filters).filter(([_, value]) => value.trim() !== "");
  if (activeFilters.length > 0) {
    const hasWhere = /\bWHERE\b/i.test(sql);
    const conditions: string[] = [];
    
    activeFilters.forEach(([columnName, filterValue]) => {
      const escapedColumn = escapeIdentifier(columnName, dbType);
      const mode = filterModes?.[columnName] ?? 'fuzzy';
      
      if (mode === 'exact') {
        const escapedValue = escapeSqlValue(filterValue, dbType);
        conditions.push(`${escapedColumn} = ${escapedValue}`);
      } else {
        const escapedValue = escapeSqlValue(`%${filterValue}%`, dbType);
        conditions.push(`${escapedColumn} LIKE ${escapedValue}`);
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
      
      sql = sql.slice(0, insertPosition).trim() + ` ORDER BY ${orderByClause} ` + sql.slice(insertPosition).trimStart();
    }
  }
  
  return sql;
}

/** 打开表浏览时的默认每页行数 */
export const DEFAULT_TABLE_PAGE_SIZE = 50;

/**
 * 构建打开表时的基础 SELECT SQL（不含分页）
 */
export function buildTableSelectSql(
  tableName: string,
  dbType: string,
  database?: string | null
): string {
  const escapedTableName = buildTableName(tableName, dbType, database);
  return `SELECT * FROM ${escapedTableName}`;
}

/**
 * 移除 SQL 中的分页子句（LIMIT / TOP / OFFSET FETCH）
 */
export function stripPaginationClauses(sql: string, _dbType?: string): string {
  let cleaned = sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();

  cleaned = cleaned.replace(
    /\s+OFFSET\s+\d+\s+ROWS\s+FETCH\s+NEXT\s+\d+\s+ROWS\s+ONLY/gi,
    ""
  );
  cleaned = cleaned.replace(/\s+LIMIT\s+\d+(\s+OFFSET\s+\d+)?/gi, "");
  cleaned = cleaned.replace(/\s+OFFSET\s+\d+/gi, "");
  cleaned = cleaned.replace(/^SELECT\s+TOP\s+\d+\s+/i, "SELECT ");

  return cleaned.trim();
}

function removeOrderByClause(sql: string): string {
  const orderByMatch = sql.match(/\bORDER\s+BY\b/i);
  if (!orderByMatch || orderByMatch.index === undefined) {
    return sql;
  }

  const beforeOrderBy = sql.slice(0, orderByMatch.index).trim();
  const afterOrderBy = sql.slice(orderByMatch.index + orderByMatch[0].length);
  const nextClauseMatch = afterOrderBy.match(
    /\b(LIMIT|OFFSET|FETCH)\b/i
  );

  if (nextClauseMatch?.index !== undefined) {
    return `${beforeOrderBy} ${afterOrderBy.slice(nextClauseMatch.index).trim()}`.trim();
  }

  return beforeOrderBy;
}

/**
 * 由 SELECT 查询构建 COUNT SQL（用于分页总数）
 */
export function buildCountSql(baseSql: string, dbType: string): string {
  let sql = stripPaginationClauses(baseSql, dbType);
  sql = removeOrderByClause(sql);

  const countSql = sql.replace(
    /^SELECT\s+(?:DISTINCT\s+)?[\s\S]*?\sFROM\s/i,
    "SELECT COUNT(*) AS __feather_count FROM "
  );

  if (countSql === sql) {
    throw new Error("无法从 SQL 构建 COUNT 查询");
  }

  return countSql;
}

/**
 * 为 SELECT 查询添加 LIMIT/OFFSET 分页
 */
export function applyPagination(
  sql: string,
  dbType: string,
  options: { limit: number; offset?: number }
): string {
  const { limit, offset = 0 } = options;
  const cleaned = stripPaginationClauses(sql, dbType);

  if (dbType === "mssql") {
    if (offset === 0) {
      return cleaned.replace(/^SELECT/i, `SELECT TOP ${limit}`);
    }

    const hasOrderBy = /\bORDER\s+BY\b/i.test(cleaned);
    const withOrderBy = hasOrderBy
      ? cleaned
      : `${cleaned} ORDER BY (SELECT NULL)`;
    return `${withOrderBy} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
  }

  if (offset === 0) {
    return `${cleaned} LIMIT ${limit}`;
  }

  return `${cleaned} LIMIT ${limit} OFFSET ${offset}`;
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
    
    // 使用 LIKE 进行模糊匹配（区分大小写）
    conditions.push(`${escapedColumn} LIKE ${escapedValue}`);
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
 * 构建 WHERE 子句（优先使用主键列，否则使用所有列）
 */
function buildWhereClause(
  result: QueryResult,
  rowIndex: number,
  dbType: string,
  primaryKeyColumns?: string[]
): string {
  const originalRow = result.rows[rowIndex];
  let columnsToUse: string[] = primaryKeyColumns && primaryKeyColumns.length > 0
    ? primaryKeyColumns.filter(col => result.columns.includes(col))
    : result.columns;

  if (columnsToUse.length === 0) {
    columnsToUse = result.columns;
  }

  const whereConditions: string[] = [];
  columnsToUse.forEach((col) => {
    const colIndex = result.columns.indexOf(col);
    if (colIndex === -1) return;
    const originalValue = originalRow[colIndex];
    const escapedCol = escapeIdentifier(col, dbType);

    if (originalValue === null || originalValue === undefined) {
      whereConditions.push(`${escapedCol} IS NULL`);
    } else {
      const escapedVal = escapeSqlValue(originalValue, dbType);
      whereConditions.push(`${escapedCol} = ${escapedVal}`);
    }
  });

  return whereConditions.join(' AND ');
}

/**
 * 生成 UPDATE SQL 语句（基于修改记录）
 * @param primaryKeyColumns 主键列名，若提供则优先用于 WHERE 子句，提高准确性和性能
 */
export function generateUpdateSql(
  modifications: Map<string, CellModification>,
  sql: string,
  result: QueryResult,
  currentConnection: Connection,
  currentDatabase: string | null,
  primaryKeyColumns?: string[]
): string[] {
  if (modifications.size === 0 || !sql || !currentConnection) return [];
  
  const tableInfo = extractTableInfo(sql);
  if (!tableInfo || !tableInfo.tableName) {
    throw new Error("无法从 SQL 中提取表名，请确保 SQL 是 SELECT ... FROM table_name 格式");
  }
  
  const dbType = currentConnection.type;
  const databaseToUse = tableInfo.database || currentDatabase;
  const escapedTableName = buildTableName(tableInfo.tableName, dbType, databaseToUse);
  
  const rowMods = new Map<number, Map<string, any>>();
  
  modifications.forEach((mod) => {
    if (!rowMods.has(mod.rowIndex)) {
      rowMods.set(mod.rowIndex, new Map());
    }
    rowMods.get(mod.rowIndex)!.set(mod.column, mod.newValue);
  });
  
  const sqls: string[] = [];
  
  rowMods.forEach((columns, rowIndex) => {
    const setClause = Array.from(columns.entries())
      .map(([col, val]) => {
        const escapedCol = escapeIdentifier(col, dbType);
        const escapedVal = escapeSqlValue(val, dbType);
        return `${escapedCol} = ${escapedVal}`;
      })
      .join(', ');
    
    const whereClause = buildWhereClause(result, rowIndex, dbType, primaryKeyColumns);
    
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
 * @param primaryKeyColumns 主键列名，若提供则优先用于 WHERE 子句
 */
export function generateUpdateSqlForRows(
  selectedRows: Set<number>,
  sql: string,
  editedData: QueryResult,
  result: QueryResult,
  displayColumns: string[],
  currentConnection: Connection,
  currentDatabase: string | null,
  primaryKeyColumns?: string[]
): string | null {
  if (!sql || !currentConnection || selectedRows.size === 0) return null;
  
  const tableInfo = extractTableInfo(sql);
  if (!tableInfo || !tableInfo.tableName) {
    return null;
  }
  
  const dbType = currentConnection.type;
  const databaseToUse = tableInfo.database || currentDatabase;
  const escapedTableName = buildTableName(tableInfo.tableName, dbType, databaseToUse);
  
  const selectedRowIndices = Array.from(selectedRows).sort((a, b) => a - b);
  
  if (selectedRowIndices.length === 0) return null;
  
  const columnsToUse = primaryKeyColumns && primaryKeyColumns.length > 0
    ? primaryKeyColumns.filter(col => displayColumns.includes(col))
    : displayColumns;

  const sqls: string[] = [];
  
  for (const rowIndex of selectedRowIndices) {
    if (rowIndex >= editedData.rows.length) continue;
    
    const row = editedData.rows[rowIndex];
    const originalRow = result.rows[rowIndex];
    
    const setClause = displayColumns.map((col, colIndex) => {
      const escapedCol = escapeIdentifier(col, dbType);
      const val = row[colIndex];
      const escapedVal = escapeSqlValue(val, dbType);
      return `${escapedCol} = ${escapedVal}`;
    }).join(', ');
    
    const whereConditions: string[] = [];
    columnsToUse.forEach((col) => {
      const colIndex = displayColumns.indexOf(col);
      if (colIndex === -1) return;
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

