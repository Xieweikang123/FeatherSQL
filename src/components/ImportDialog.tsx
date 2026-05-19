import { useState, useRef } from "react";
import { readFileContent, generateInsertSql, type ImportData } from "../utils/importUtils";
import { executeSql } from "../lib/commands";
import { useConnectionStore } from "../store/connectionStore";
import {
  selectCurrentConnectionId,
  selectCurrentDatabase,
} from "../store/selectors";
import { useEscapeKey } from "../hooks/useEscapeKey";

interface ImportDialogProps {
  tableName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ImportDialog({ tableName, onClose, onSuccess }: ImportDialogProps) {
  const currentConnectionId = useConnectionStore(selectCurrentConnectionId);
  const currentDatabase = useConnectionStore(selectCurrentDatabase);
  const connections = useConnectionStore((s) => s.connections);
  const setIsQuerying = useConnectionStore((s) => s.setIsQuerying);

  const [loading, setLoading] = useState(false);
  const [importData, setImportData] = useState<ImportData | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [previewRows, setPreviewRows] = useState<number>(5);
  const [batchSize, setBatchSize] = useState<number>(100);
  const [skipFirstRow, setSkipFirstRow] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; success: number; error: number } | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentConnection = connections.find(c => c.id === currentConnectionId);
  const dbType = currentConnection?.type || "sqlite";

  // 支持 ESC 键关闭
  useEscapeKey(onClose, loading);

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setFileName(file.name);

    try {
      const result = await readFileContent(file);
      setImportData(result.data);
    } catch (error) {
      setImportData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!importData || !currentConnectionId || !currentConnection) {
      return;
    }

    setLoading(true);
    setIsQuerying(true);
    setImportErrors([]);

    try {
      // 处理跳过第一行的情况
      let dataToImport = importData;
      if (skipFirstRow && dataToImport.rows.length > 0) {
        dataToImport = {
          columns: dataToImport.columns,
          rows: dataToImport.rows.slice(1),
        };
      }

      if (dataToImport.rows.length === 0) {
        return;
      }

      // 生成 INSERT SQL 语句
      const sqls = generateInsertSql(
        tableName,
        dataToImport,
        dbType,
        currentDatabase,
        batchSize
      );

      const dbParam = currentConnection.type === "sqlite" ? "" : (currentDatabase || undefined);
      const total = sqls.length;

      // 执行所有 INSERT 语句，实时更新进度
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < sqls.length; i++) {
        setImportProgress({ current: i + 1, total, success: successCount, error: errorCount });
        try {
          await executeSql(currentConnectionId, sqls[i], dbParam);
          successCount++;
        } catch (error) {
          errorCount++;
          const errorMsg = error instanceof Error ? error.message : String(error);
          const batchStart = i * batchSize + 1;
          const batchEnd = Math.min((i + 1) * batchSize, dataToImport.rows.length);
          errors.push(`批次 ${i + 1} (行 ${batchStart}-${batchEnd}): ${errorMsg}`);
          if (errors.length <= 5) {
            setImportErrors([...errors]);
          }
        }
      }

      setImportProgress({ current: total, total, success: successCount, error: errorCount });
      if (errors.length > 5) {
        setImportErrors([...errors.slice(0, 5), `... 还有 ${errors.length - 5} 个错误`]);
      } else {
        setImportErrors(errors);
      }

      if (errorCount === 0) {
        onSuccess?.();
        onClose();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setImportErrors([errorMsg]);
    } finally {
      setLoading(false);
      setIsQuerying(false);
      setImportProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
      <div
        className="neu-raised rounded-lg shadow-xl"
        style={{
          width: '90%',
          maxWidth: '800px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 neu-flat rounded-t-lg" style={{ borderBottom: '1px solid var(--neu-dark)' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--neu-text)' }}>
              导入数据到表: {tableName}
            </h2>
            <button
              onClick={onClose}
              disabled={loading}
              className="w-8 h-8 flex items-center justify-center rounded transition-all neu-flat hover:neu-hover active:neu-active disabled:opacity-50"
              style={{ color: 'var(--neu-text)' }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {/* File Selection */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--neu-text)' }}>
              选择文件
            </label>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json,.xlsx,.xls"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="px-4 py-2 rounded transition-all neu-flat hover:neu-hover active:neu-active disabled:opacity-50"
                style={{ color: 'var(--neu-text)' }}
              >
                {fileName || "选择文件 (CSV/JSON/Excel)"}
              </button>
              {fileName && (
                <span className="px-3 py-2 text-sm neu-pressed rounded" style={{ color: 'var(--neu-text-light)' }}>
                  {fileName}
                </span>
              )}
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--neu-text-light)' }}>
              支持 CSV、JSON 和 Excel (.xlsx, .xls) 格式
            </p>
          </div>

          {/* Import Options */}
          {importData && (
            <div className="space-y-3 neu-pressed rounded-lg p-4">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--neu-text)' }}>
                导入选项
              </h3>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="skipFirstRow"
                  checked={skipFirstRow}
                  onChange={(e) => setSkipFirstRow(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="skipFirstRow" className="text-sm" style={{ color: 'var(--neu-text)' }}>
                  跳过第一行数据（如果第一行是标题）
                </label>
              </div>

              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--neu-text)' }}>
                  批处理大小: {batchSize} 行/批
                </label>
                <input
                  type="range"
                  min="10"
                  max="1000"
                  step="10"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs mt-1" style={{ color: 'var(--neu-text-light)' }}>
                  较大的批处理大小可以提高导入速度，但可能增加内存使用
                </p>
              </div>
            </div>
          )}

          {/* Data Preview */}
          {importData && (
            <div>
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--neu-text)' }}>
                数据预览 (共 {importData.rows.length} 行，{importData.columns.length} 列)
              </h3>
              <div className="neu-pressed rounded-lg overflow-auto" style={{ maxHeight: '300px' }}>
                <table className="w-full text-xs" style={{ color: 'var(--neu-text)' }}>
                  <thead>
                    <tr className="neu-flat" style={{ borderBottom: '1px solid var(--neu-dark)' }}>
                      {importData.columns.map((col, idx) => (
                        <th key={idx} className="px-3 py-2 text-left font-semibold">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importData.rows.slice(0, previewRows).map((row, rowIdx) => (
                      <tr key={rowIdx} style={{ borderBottom: '1px solid var(--neu-dark)' }}>
                        {row.map((cell, cellIdx) => (
                          <td key={cellIdx} className="px-3 py-2">
                            {cell === null || cell === undefined ? (
                              <span style={{ color: 'var(--neu-text-light)' }}>NULL</span>
                            ) : (
                              String(cell).length > 50 ? (
                                <span title={String(cell)}>
                                  {String(cell).substring(0, 50)}...
                                </span>
                              ) : (
                                String(cell)
                              )
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importData.rows.length > previewRows && (
                  <div className="px-3 py-2 text-xs text-center" style={{ color: 'var(--neu-text-light)' }}>
                    显示前 {previewRows} 行，共 {importData.rows.length} 行
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Import Progress */}
        {importProgress && (
          <div className="px-6 py-3 neu-pressed rounded-lg mx-6 mb-3 space-y-2" style={{ border: '1px solid var(--neu-dark)' }}>
            <div className="flex justify-between text-sm" style={{ color: 'var(--neu-text)' }}>
              <span>导入进度: {importProgress.current} / {importProgress.total} 批次</span>
              <span>
                成功 <span style={{ color: 'var(--neu-success)' }}>{importProgress.success}</span>
                {importProgress.error > 0 && (
                  <> · 失败 <span style={{ color: 'var(--neu-error, #e74c3c)' }}>{importProgress.error}</span></>
                )}
              </span>
            </div>
            <div className="w-full h-2 neu-flat rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${(importProgress.current / importProgress.total) * 100}%`,
                  backgroundColor: 'var(--neu-accent)',
                }}
              />
            </div>
            {importErrors.length > 0 && (
              <div className="mt-2 text-xs space-y-1 max-h-20 overflow-auto" style={{ color: 'var(--neu-error, #e74c3c)' }}>
                {importErrors.map((err, i) => (
                  <div key={i} className="truncate" title={err}>{err}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 neu-flat rounded-b-lg flex items-center justify-end gap-3" style={{ borderTop: '1px solid var(--neu-dark)' }}>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded transition-all neu-flat hover:neu-hover active:neu-active disabled:opacity-50"
            style={{ color: 'var(--neu-text)' }}
          >
            取消
          </button>
          <button
            onClick={handleImport}
            disabled={loading || !importData}
            className="px-4 py-2 rounded transition-all neu-raised hover:neu-hover active:neu-active disabled:opacity-50 font-medium"
            style={{ color: 'var(--neu-success)' }}
          >
            {loading ? `导入中 ${importProgress ? `(${importProgress.current}/${importProgress.total})` : '...'}` : `导入 ${importData ? importData.rows.length : 0} 行数据`}
          </button>
        </div>
      </div>
    </div>
  );
}

