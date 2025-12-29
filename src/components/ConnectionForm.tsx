import { useState, useEffect } from "react";
import { createConnection, updateConnection, testConnection, type Connection, type ConnectionConfig } from "../lib/commands";
import { useConnectionStore } from "../store/connectionStore";
import { open } from "@tauri-apps/plugin-dialog";
import { useEscapeKey } from "../hooks/useEscapeKey";

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
  const { addLog } = useConnectionStore();
  const [name, setName] = useState("");
  const [dbType, setDbType] = useState<"sqlite" | "mysql" | "postgres">("sqlite");
  const [config, setConfig] = useState<ConnectionConfig>({});
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (connection) {
      setName(connection.name);
      setDbType(connection.type as "sqlite" | "mysql" | "postgres");
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
      addLog(`选择文件失败: ${error}`);
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
      if (dbType === "mysql" || dbType === "postgres") {
        // Use actual values from input fields (with defaults)
        const host = (config.host && config.host.trim()) || "localhost";
        const port = config.port || (dbType === "mysql" ? 3306 : 5432);
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
        port: config.port || (dbType === "mysql" ? 3306 : 5432),
      };

      const result = await testConnection(dbType, testConfig);
      setTestResult(result);
      addLog(`测试连接: ${result}`);
    } catch (error) {
      const errorMsg = String(error);
      setTestResult(`连接失败: ${errorMsg}`);
      addLog(`测试连接失败: ${errorMsg}`);
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
      
      if (dbType === "mysql" || dbType === "postgres") {
        submitConfig.host = config.host || "localhost";
        submitConfig.port = config.port || (dbType === "mysql" ? 3306 : 5432);
      }

      if (connection) {
        // Update existing connection
        await updateConnection(connection.id, name, submitConfig);
        addLog(`连接 "${name}" 已更新`);
      } else {
        // Create new connection
        await createConnection(name, dbType, submitConfig);
        addLog(`连接 "${name}" 已创建`);
      }
      onSuccess();
    } catch (error) {
      addLog(`保存连接失败: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">
          {connection ? "编辑连接" : "新建连接"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">数据库类型</label>
            <select
              value={dbType}
              onChange={(e) => {
                const newDbType = e.target.value as "sqlite" | "mysql" | "postgres";
                setDbType(newDbType);
                if (newDbType === "sqlite") {
                  setConfig({});
                } else {
                  // Set default values for MySQL/PostgreSQL
                  setConfig({
                    host: "localhost",
                    port: newDbType === "mysql" ? 3306 : 5432,
                    user: "",
                    password: "",
                    database: "",
                    ssl: false,
                  });
                }
              }}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
            >
              <option value="sqlite">SQLite</option>
              <option value="mysql">MySQL</option>
              <option value="postgres">PostgreSQL</option>
            </select>
          </div>

          {dbType === "sqlite" && (
            <div>
              <label className="block text-sm font-medium mb-1">文件路径</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.filepath || ""}
                  onChange={(e) => setConfig({ ...config, filepath: e.target.value })}
                  required
                  placeholder="选择数据库文件..."
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
                <button
                  type="button"
                  onClick={handleFileSelect}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
                >
                  浏览
                </button>
              </div>
            </div>
          )}

          {(dbType === "mysql" || dbType === "postgres") && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">主机</label>
                  <input
                    type="text"
                    value={config.host || "localhost"}
                    onChange={(e) => setConfig({ ...config, host: e.target.value })}
                    required
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">端口</label>
                  <input
                    type="number"
                    value={config.port || (dbType === "mysql" ? 3306 : 5432)}
                    onChange={(e) => {
                      const portValue = e.target.value;
                      const port = portValue === "" ? undefined : parseInt(portValue);
                      setConfig({ ...config, port: isNaN(port as number) ? undefined : port });
                    }}
                    required
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">用户名</label>
                <input
                  type="text"
                  value={config.user || ""}
                  onChange={(e) => setConfig({ ...config, user: e.target.value })}
                  required
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">密码</label>
                <input
                  type="password"
                  value={config.password || ""}
                  onChange={(e) => setConfig({ ...config, password: e.target.value })}
                  required
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
                <p className="text-xs text-yellow-400 mt-1">
                  ⚠️ 密码将以明文存储，请注意安全
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">数据库名（可选）</label>
                <input
                  type="text"
                  value={config.database || ""}
                  onChange={(e) => setConfig({ ...config, database: e.target.value })}
                  placeholder="留空则连接到服务器"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
                <p className="text-xs text-gray-400 mt-1">
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
                  <span className="text-sm">启用 SSL</span>
                </label>
              </div>
            </>
          )}

          {testResult && (
            <div className={`p-3 rounded text-sm ${
              testResult.includes("成功") 
                ? "bg-green-900/50 text-green-300 border border-green-700" 
                : "bg-red-900/50 text-red-300 border border-red-700"
            }`}>
              {testResult}
            </div>
          )}

          <div className="flex gap-2 justify-between pt-4">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || loading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? "测试中..." : "测试连接"}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loading || testing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
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

