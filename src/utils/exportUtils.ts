import * as XLSX from 'xlsx';

export type ExportFormat = 'csv' | 'json' | 'excel';

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
 * 导出数据为 Excel 格式
 */
export function exportToExcel(data: ExportData, filename: string = 'export'): void {
  try {
    const excelBuffer = generateExcelBuffer(data);
    
    // 使用 Blob 下载方式
    const blob = new Blob([excelBuffer], { 
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
function downloadBlob(blob: Blob, filename: string, mimeType: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

