import { useState, useRef } from "react";
import { readFileContent, generateInsertSql, type ImportData } from "../utils/importUtils";
import { executeSql } from "../lib/commands";
import { useConnectionStore } from "../store/connectionStore";
import { useEscapeKey } from "../hooks/useEscapeKey";

interface ImportDialogProps {
  tableName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ImportDialog({ tableName, onClose, onSuccess }: ImportDialogProps) {
  const {
    currentConnectionId,
    currentDatabase,
    connections,
    addLog,
    setIsQuerying,
  } = useConnectionStore();

  const [loading, setLoading] = useState(false);
  const [importData, setImportData] = useState<ImportData | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [previewRows, setPreviewRows] = useState<number>(5);
  const [batchSize, setBatchSize] = useState<number>(100);
  const [skipFirstRow, setSkipFirstRow] = useState<boolean>(false);
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
      addLog(`成功解析文件: ${file.name}，共 ${result.data.rows.length} 行，${result.data.columns.length} 列`);
    } catch (error) {
      addLog(`解析文件失败: ${error instanceof Error ? error.message : String(error)}`);
      setImportData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!importData || !currentConnectionId || !currentConnection) {
      addLog("错误: 请先选择文件并确保已连接数据库");
      return;
    }

    setLoading(true);
    setIsQuerying(true);

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
        addLog("错误: 没有可导入的数据");
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

      addLog(`开始导入 ${dataToImport.rows.length} 行数据，将执行 ${sqls.length} 条 SQL 语句...`);

      const dbParam = currentConnection.type === "sqlite" ? "" : (currentDatabase || undefined);

      // 执行所有 INSERT 语句
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < sqls.length; i++) {
        try {
          await executeSql(currentConnectionId, sqls[i], dbParam);
          successCount++;
          if ((i + 1) % 10 === 0) {
            addLog(`已执行 ${i + 1}/${sqls.length} 条 SQL 语句...`);
          }
        } catch (error) {
          errorCount++;
          const errorMsg = error instanceof Error ? error.message : String(error);
          addLog(`执行第 ${i + 1} 条 SQL 失败: ${errorMsg}`);
          // 继续执行其他语句
        }
      }

      if (errorCount === 0) {
        addLog(`✅ 导入成功！共导入 ${dataToImport.rows.length} 行数据`);
        onSuccess?.();
        onClose();
      } else {
        addLog(`⚠️ 导入完成，但部分数据导入失败。成功: ${successCount}，失败: ${errorCount}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`导入失败: ${errorMsg}`);
    } finally {
      setLoading(false);
      setIsQuerying(false);
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
            {loading ? "导入中..." : `导入 ${importData ? importData.rows.length : 0} 行数据`}
          </button>
        </div>
      </div>
    </div>
  );
}

