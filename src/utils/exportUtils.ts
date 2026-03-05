import * as XLSX from 'xlsx';
import { escapeIdentifier, escapeSqlValue, buildTableName } from '../lib/utils';

export type ExportFormat = 'csv' | 'json' | 'excel' | 'sql';

export interface ExportData {
  columns: string[];
  rows: any[][];
}

/**
 * 生成 CSV 内容
 */
export function generateCsvContent(data: ExportData): string {
  const { columns, rows } = data;
  
  // 构建 CSV 内容
  const csvRows: string[] = [];
  
  // 添加表头
  csvRows.push(columns.map(col => escapeCsvValue(col)).join(','));
  
  // 添加数据行
  for (const row of rows) {
    csvRows.push(row.map(cell => escapeCsvValue(cell)).join(','));
  }
  
  return csvRows.join('\n');
}

/**
 * 导出数据为 CSV 格式
 */
export function exportToCsv(data: ExportData, filename: string = 'export'): void {
  const csvContent = generateCsvContent(data);
  
  // 添加 BOM 以支持中文
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`, 'text/csv');
}

/**
 * 导出数据为 JSON 格式
 */
export function exportToJson(data: ExportData, filename: string = 'export'): void {
  const { columns, rows } = data;
  
  // 将数据转换为对象数组
  const jsonData = rows.map(row => {
    const obj: Record<string, any> = {};
    columns.forEach((col, index) => {
      obj[col] = row[index];
    });
    return obj;
  });
  
  const jsonContent = JSON.stringify(jsonData, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  downloadBlob(blob, `${filename}.json`, 'application/json');
}

/**
 * 生成 Excel 文件缓冲区
 */
export function generateExcelBuffer(data: ExportData): Uint8Array {
  const { columns, rows } = data;
  
  // 创建工作簿
  const wb = XLSX.utils.book_new();
  
  // 准备数据：表头 + 数据行
  const wsData: any[][] = [columns];
  wsData.push(...rows);
  
  // 创建工作表
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // 设置列宽（自动调整）
  const colWidths = columns.map((col, colIndex) => {
    let maxLength = col.length;
    rows.forEach(row => {
      const cellValue = row[colIndex];
      const cellLength = cellValue != null ? String(cellValue).length : 0;
      if (cellLength > maxLength) {
        maxLength = cellLength;
      }
    });
    return { wch: Math.min(maxLength + 2, 50) }; // 最大宽度 50
  });
  ws['!cols'] = colWidths;
  
  // 将工作表添加到工作簿
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  
  // 生成 Excel 文件数据
  const excelBuffer = XLSX.write(wb, { 
    bookType: 'xlsx', 
    type: 'array',
    compression: true
  });
  
  return excelBuffer;
}

/**
 * 导出数据为 SQL (INSERT 语句) 格式
 */
export function exportToSql(
  data: ExportData,
  filename: string,
  tableName: string,
  dbType: string = 'sqlite',
  database?: string | null
): void {
  const escapedTableName = buildTableName(tableName, dbType, database);
  const escapedColumns = data.columns.map(col => escapeIdentifier(col, dbType));
  const columnsClause = escapedColumns.join(', ');

  const valuesClauses = data.rows.map(row => {
    const values = row.map(val => escapeSqlValue(val, dbType));
    return `(${values.join(', ')})`;
  });

  const insertStatements = valuesClauses.map(values => 
    `INSERT INTO ${escapedTableName} (${columnsClause}) VALUES ${values};`
  );

  const sqlContent = insertStatements.join('\n\n');
  const blob = new Blob([sqlContent], { type: 'text/plain;charset=utf-8;' });
  downloadBlob(blob, `${filename}.sql`, 'text/plain');
}

/**
 * 导出数据为 Excel 格式
 */
export function exportToExcel(data: ExportData, filename: string = 'export'): void {
  try {
    const excelBuffer = generateExcelBuffer(data);
    
    // 使用 Blob 下载方式
    // Uint8Array 可以直接用于 Blob 构造函数，使用类型断言解决类型检查问题
    const blob = new Blob([excelBuffer as BlobPart], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    downloadBlob(blob, `${filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch (error) {
    console.error('Excel export error:', error);
    throw new Error(`无法导出 Excel 文件: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * CSV 值转义
 */
function escapeCsvValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  const str = String(value);
  
  // 如果包含逗号、引号或换行符，需要用引号包裹
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // 转义引号：将 " 替换为 ""
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

/**
 * 下载 Blob 文件
 */
function downloadBlob(blob: Blob, filename: string, _mimeType: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  // Tauri 环境下导出后自动打开下载文件夹
  openDownloadFolderAfterExport();
}

/**
 * 导出完成后打开下载文件夹（仅 Tauri 环境）
 */
function openDownloadFolderAfterExport(): void {
  if (typeof window === 'undefined') return;

  setTimeout(async () => {
    try {
      const { downloadDir } = await import('@tauri-apps/api/path');
      const { openPath } = await import('@tauri-apps/plugin-opener');
      const dir = await downloadDir();
      await openPath(dir);
    } catch (e) {
      console.warn('打开下载文件夹失败:', e);
    }
  }, 500);
}

