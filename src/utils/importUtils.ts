import * as XLSX from 'xlsx';
import { escapeIdentifier, buildTableName, escapeSqlValue } from '../lib/utils';

export type ImportFormat = 'csv' | 'json' | 'excel';

export interface ImportData {
  columns: string[];
  rows: any[][];
}

/**
 * 解析 CSV 文件内容
 */
export function parseCsvContent(content: string): ImportData {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length === 0) {
    throw new Error('CSV 文件为空');
  }
  
  // 解析 CSV 行（处理引号内的逗号）
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // 转义的引号
          current += '"';
          i++; // 跳过下一个引号
        } else {
          // 切换引号状态
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // 字段分隔符
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // 添加最后一个字段
    result.push(current.trim());
    return result;
  };
  
  // 第一行是表头
  const columns = parseCsvLine(lines[0]);
  
  // 解析数据行
  const rows: any[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    // 确保行长度与列数一致
    while (row.length < columns.length) {
      row.push(null);
    }
    rows.push(row.slice(0, columns.length));
  }
  
  return { columns, rows };
}

/**
 * 解析 JSON 文件内容
 */
export function parseJsonContent(content: string): ImportData {
  let data: any[];
  
  try {
    data = JSON.parse(content);
  } catch (error) {
    throw new Error(`JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  if (!Array.isArray(data)) {
    throw new Error('JSON 文件必须包含一个数组');
  }
  
  if (data.length === 0) {
    throw new Error('JSON 数组为空');
  }
  
  // 从第一个对象获取列名
  const firstItem = data[0];
  if (typeof firstItem !== 'object' || firstItem === null) {
    throw new Error('JSON 数组中的元素必须是对象');
  }
  
  const columns = Object.keys(firstItem);
  
  if (columns.length === 0) {
    throw new Error('JSON 对象中没有字段');
  }
  
  // 转换为行数据
  const rows = data.map(item => {
    return columns.map(col => {
      const value = item[col];
      // 处理 null/undefined
      if (value === null || value === undefined) {
        return null;
      }
      // 如果是对象或数组，转换为 JSON 字符串
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return value;
    });
  });
  
  return { columns, rows };
}

/**
 * 解析 Excel 文件内容
 */
export function parseExcelContent(buffer: ArrayBuffer): ImportData {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' });
    
    if (workbook.SheetNames.length === 0) {
      throw new Error('Excel 文件没有工作表');
    }
    
    // 使用第一个工作表
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // 转换为数组
    const data = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1,
      defval: null, // 空单元格使用 null
      raw: false // 不保留原始值，统一转换为字符串
    }) as any[][];
    
    if (data.length === 0) {
      throw new Error('Excel 工作表为空');
    }
    
    // 第一行是表头
    const columns = (data[0] || []).map((col: any) => String(col || ''));
    
    if (columns.length === 0 || columns.every(col => !col.trim())) {
      throw new Error('Excel 文件没有有效的表头');
    }
    
    // 数据行
    const rows = data.slice(1).map(row => {
      // 确保行长度与列数一致
      const paddedRow = [...row];
      while (paddedRow.length < columns.length) {
        paddedRow.push(null);
      }
      return paddedRow.slice(0, columns.length);
    });
    
    return { columns, rows };
  } catch (error) {
    throw new Error(`Excel 解析失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 读取文件内容
 */
export async function readFileContent(file: File): Promise<{ format: ImportFormat; data: ImportData }> {
  const fileName = file.name.toLowerCase();
  
  // 根据文件扩展名确定格式
  let format: ImportFormat;
  if (fileName.endsWith('.csv')) {
    format = 'csv';
  } else if (fileName.endsWith('.json')) {
    format = 'json';
  } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    format = 'excel';
  } else {
    throw new Error('不支持的文件格式。请使用 CSV、JSON 或 Excel 文件');
  }
  
  // 读取文件内容
  if (format === 'excel') {
    const buffer = await file.arrayBuffer();
    const data = parseExcelContent(buffer);
    return { format, data };
  } else {
    const text = await file.text();
    const data = format === 'csv' 
      ? parseCsvContent(text)
      : parseJsonContent(text);
    return { format, data };
  }
}

/**
 * 生成 INSERT SQL 语句
 */
export function generateInsertSql(
  tableName: string,
  data: ImportData,
  dbType: string,
  database: string | null | undefined,
  batchSize: number = 100
): string[] {
  const escapedTableName = buildTableName(tableName, dbType, database);
  const escapedColumns = data.columns.map(col => escapeIdentifier(col, dbType));
  
  const sqls: string[] = [];
  const totalRows = data.rows.length;
  
  // 分批生成 INSERT 语句
  for (let i = 0; i < totalRows; i += batchSize) {
    const batch = data.rows.slice(i, i + batchSize);
    
    // 构建 VALUES 子句
    const valuesClauses = batch.map(row => {
      const values = row.map(val => escapeSqlValue(val, dbType));
      return `(${values.join(', ')})`;
    });
    
    // 生成 INSERT 语句
    const sql = `INSERT INTO ${escapedTableName} (${escapedColumns.join(', ')}) VALUES ${valuesClauses.join(', ')};`;
    sqls.push(sql);
  }
  
  return sqls;
}

