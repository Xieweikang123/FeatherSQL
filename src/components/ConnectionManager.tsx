import { useEffect, useState } from "react";
import { useConnectionStore } from "../store/connectionStore";
import {
  getConnections,
  deleteConnection,
  type Connection,
} from "../lib/commands";
import ConnectionForm from "./ConnectionForm";

export default function ConnectionManager() {
  const {
    connections,
    currentConnectionId,
    setConnections,
    setCurrentConnection,
    addLog,
  } = useConnectionStore();
  const [showForm, setShowForm] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const conns = await getConnections();
      setConnections(conns);
      addLog(`已加载 ${conns.length} 个连接`);
    } catch (error) {
      addLog(`加载连接失败: ${error}`);
    }
  };

  const handleConnectionClick = (connection: Connection) => {
    setCurrentConnection(connection.id);
    addLog(`切换到连接: ${connection.name}`);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("确定要删除此连接吗？")) {
      try {
        await deleteConnection(id);
        addLog("连接已删除");
        if (currentConnectionId === id) {
          setCurrentConnection(null);
        }
        loadConnections();
      } catch (error) {
        addLog(`删除连接失败: ${error}`);
      }
    }
  };

  const handleEdit = (e: React.MouseEvent, connection: Connection) => {
    e.stopPropagation();
    setEditingConnection(connection);
    setShowForm(true);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-700">
        <button
          onClick={() => {
            setEditingConnection(null);
            setShowForm(true);
          }}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium"
        >
          + 新建连接
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {connections.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">
            暂无连接
            <br />
            点击上方按钮创建
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {connections.map((connection) => (
              <div
                key={connection.id}
                onClick={() => handleConnectionClick(connection)}
                className={`p-3 cursor-pointer hover:bg-gray-700 ${
                  currentConnectionId === connection.id
                    ? "bg-gray-700 border-l-2 border-blue-500"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {connection.name}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {connection.type}
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button
                      onClick={(e) => handleEdit(e, connection)}
                      className="p-1 hover:bg-gray-600 rounded text-xs"
                      title="编辑"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, connection.id)}
                      className="p-1 hover:bg-gray-600 rounded text-xs"
                      title="删除"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <ConnectionForm
          connection={editingConnection}
          onClose={() => {
            setShowForm(false);
            setEditingConnection(null);
          }}
          onSuccess={() => {
            setShowForm(false);
            setEditingConnection(null);
            loadConnections();
          }}
        />
      )}
    </div>
  );
}

