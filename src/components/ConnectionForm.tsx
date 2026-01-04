import { useState, useEffect } from "react";
import { createConnection, updateConnection, testConnection, type Connection, type ConnectionConfig } from "../lib/commands";
import { useConnectionStore } from "../store/connectionStore";
import { open } from "@tauri-apps/plugin-dialog";
import { useEscapeKey } from "../hooks/useEscapeKey";

/**
 * 获取数据库类型的默认端口
 */
function getDefaultPort(dbType: "sqlite" | "mysql" | "postgres" | "mssql"): number {
  switch (dbType) {
    case "mysql":
      return 3306;
    case "postgres":
      return 5432;
    case "mssql":
      return 1433;
    default:
      return 3306; // fallback
  }
}

interface ConnectionFormProps {
  connection: Connection | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ConnectionForm({
  connection,
  onClose,
  onSuccess,
}: ConnectionFormProps) {
  const [name, setName] = useState("");
  const [dbType, setDbType] = useState<"sqlite" | "mysql" | "postgres" | "mssql">("sqlite");
  const [config, setConfig] = useState<ConnectionConfig>({});
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (connection) {
      setName(connection.name);
      setDbType(connection.type as "sqlite" | "mysql" | "postgres" | "mssql");
      setConfig(connection.config || {});
    } else {
      setName("");
      setDbType("sqlite");
      setConfig({});
    }
  }, [connection]);

  // Handle ESC key to close the modal
  useEscapeKey(onClose, loading || testing);

  const handleFileSelect = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] }],
      });
      if (selected && typeof selected === "string") {
        setConfig({ ...config, filepath: selected });
      }
    } catch (error) {
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      // Validate required fields based on dbType
      if (dbType === "sqlite" && !config.filepath) {
        setTestResult("请先选择数据库文件");
        setTesting(false);
        return;
      }
      if (dbType === "mysql" || dbType === "postgres" || dbType === "mssql") {
        // Use actual values from input fields (with defaults)
        const host = (config.host && config.host.trim()) || "localhost";
        const port = config.port || getDefaultPort(dbType);
        const user = (config.user && config.user.trim()) || "";
        
        if (!host || !port || !user) {
          setTestResult("请填写完整的连接信息（主机、端口、用户名）");
          setTesting(false);
          return;
        }
      }

      // Prepare config with defaults for testing
      const testConfig: ConnectionConfig = {
        ...config,
        host: config.host || "localhost",
        port: config.port || getDefaultPort(dbType),
      };

      const result = await testConnection(dbType, testConfig);
      setTestResult(result);
    } catch (error) {
      const errorMsg = String(error);
      setTestResult(`连接失败: ${errorMsg}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Prepare config with defaults for saving
      const submitConfig: ConnectionConfig = {
        ...config,
      };
      
      if (dbType === "mysql" || dbType === "postgres" || dbType === "mssql") {
        submitConfig.host = config.host || "localhost";
        submitConfig.port = config.port || getDefaultPort(dbType);
      }

      if (connection) {
        // Update existing connection
        await updateConnection(connection.id, name, submitConfig);
      } else {
        // Create new connection
        await createConnection(name, dbType, submitConfig);
      }
      onSuccess();
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}>
      <div className="neu-raised rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--neu-text)' }}>
          {connection ? "编辑连接" : "新建连接"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--neu-text)' }}>名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 neu-pressed rounded transition-all focus:outline-none"
              style={{ color: 'var(--neu-text)' }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--neu-text)' }}>数据库类型</label>
            <select
              value={dbType}
              onChange={(e) => {
                const newDbType = e.target.value as "sqlite" | "mysql" | "postgres" | "mssql";
                setDbType(newDbType);
                if (newDbType === "sqlite") {
                  setConfig({});
                } else {
                  // Set default values for MySQL/PostgreSQL/MSSQL
                  setConfig({
                    host: "localhost",
                    port: getDefaultPort(newDbType),
                    user: "",
                    password: "",
                    database: "",
                    ssl: false,
                  });
                }
              }}
              className="w-full px-3 py-2 neu-pressed rounded transition-all focus:outline-none"
              style={{ color: 'var(--neu-text)' }}
            >
              <option value="sqlite">SQLite</option>
              <option value="mysql">MySQL</option>
              <option value="postgres">PostgreSQL</option>
              <option value="mssql">MSSQL</option>
            </select>
          </div>

          {dbType === "sqlite" && (
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--neu-text)' }}>文件路径</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.filepath || ""}
                  onChange={(e) => setConfig({ ...config, filepath: e.target.value })}
                  required
                  placeholder="选择数据库文件..."
                  className="flex-1 px-3 py-2 neu-pressed rounded transition-all focus:outline-none"
                  style={{ color: 'var(--neu-text)' }}
                />
                <button
                  type="button"
                  onClick={handleFileSelect}
                  className="px-4 py-2 rounded transition-all neu-flat hover:neu-hover active:neu-active"
                  style={{ color: 'var(--neu-text)' }}
                >
                  浏览
                </button>
              </div>
            </div>
          )}

          {(dbType === "mysql" || dbType === "postgres" || dbType === "mssql") && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--neu-text)' }}>主机</label>
                  <input
                    type="text"
                    value={config.host || "localhost"}
                    onChange={(e) => setConfig({ ...config, host: e.target.value })}
                    required
                    className="w-full px-3 py-2 neu-pressed rounded transition-all focus:outline-none"
                    style={{ color: 'var(--neu-text)' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--neu-text)' }}>端口</label>
                  <input
                    type="number"
                    value={config.port || getDefaultPort(dbType)}
                    onChange={(e) => {
                      const portValue = e.target.value;
                      const port = portValue === "" ? undefined : parseInt(portValue);
                      setConfig({ ...config, port: isNaN(port as number) ? undefined : port });
                    }}
                    required
                    className="w-full px-3 py-2 neu-pressed rounded transition-all focus:outline-none"
                    style={{ color: 'var(--neu-text)' }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--neu-text)' }}>用户名</label>
                <input
                  type="text"
                  value={config.user || ""}
                  onChange={(e) => setConfig({ ...config, user: e.target.value })}
                  required
                  className="w-full px-3 py-2 neu-pressed rounded transition-all focus:outline-none"
                  style={{ color: 'var(--neu-text)' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--neu-text)' }}>密码</label>
                <input
                  type="password"
                  value={config.password || ""}
                  onChange={(e) => setConfig({ ...config, password: e.target.value })}
                  required
                  className="w-full px-3 py-2 neu-pressed rounded transition-all focus:outline-none"
                  style={{ color: 'var(--neu-text)' }}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--neu-warning)' }}>
                  ⚠️ 密码将以明文存储，请注意安全
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--neu-text)' }}>数据库名（可选）</label>
                <input
                  type="text"
                  value={config.database || ""}
                  onChange={(e) => setConfig({ ...config, database: e.target.value })}
                  placeholder="留空则连接到服务器"
                  className="w-full px-3 py-2 neu-pressed rounded transition-all focus:outline-none"
                  style={{ color: 'var(--neu-text)' }}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--neu-text-light)' }}>
                  留空时连接到服务器，不指定具体数据库
                </p>
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.ssl || false}
                    onChange={(e) => setConfig({ ...config, ssl: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--neu-text)' }}>启用 SSL</span>
                </label>
              </div>
            </>
          )}

          {testResult && (
            <div className={`p-3 rounded text-sm neu-pressed ${
              testResult.includes("成功") 
                ? "" 
                : ""
            }`}
            style={{ 
              color: testResult.includes("成功") ? 'var(--neu-success)' : 'var(--neu-error)'
            }}>
              {testResult}
            </div>
          )}

          <div className="flex gap-2 justify-between pt-4">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || loading}
              className="px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-all neu-raised hover:neu-hover active:neu-active disabled:hover:neu-raised"
              style={{ color: 'var(--neu-success)' }}
            >
              {testing ? "测试中..." : "测试连接"}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded transition-all neu-flat hover:neu-hover active:neu-active"
                style={{ color: 'var(--neu-text)' }}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loading || testing}
                className="px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-all neu-raised hover:neu-hover active:neu-active disabled:hover:neu-raised"
                style={{ color: 'var(--neu-accent-dark)' }}
              >
                {loading ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

