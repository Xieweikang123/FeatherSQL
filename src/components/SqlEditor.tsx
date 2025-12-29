import { useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { useConnectionStore } from "../store/connectionStore";
import { executeSql } from "../lib/commands";

export default function SqlEditor() {
  const editorRef = useRef<string>("");
  const monacoEditorRef = useRef<any>(null);
  const { connections, currentConnectionId, setQueryResult, setError, addLog, sqlToLoad, clearSqlToLoad } =
    useConnectionStore();
  
  // Get current connection info
  const currentConnection = connections.find(c => c.id === currentConnectionId);

  // Load SQL from history
  useEffect(() => {
    if (sqlToLoad && monacoEditorRef.current) {
      monacoEditorRef.current.setValue(sqlToLoad);
      editorRef.current = sqlToLoad;
      clearSqlToLoad();
    }
  }, [sqlToLoad, clearSqlToLoad]);

  const handleExecute = async () => {
    if (!currentConnectionId) {
      setError("请先选择一个连接");
      addLog("执行失败: 未选择连接");
      return;
    }

    const sql = editorRef.current.trim();
    if (!sql) {
      setError("SQL 查询不能为空");
      return;
    }

    setError(null);
    addLog(`执行 SQL: ${sql.substring(0, 50)}...`);

    try {
      const result = await executeSql(currentConnectionId, sql);
      setQueryResult(result);
      addLog(`查询成功，返回 ${result.rows.length} 行`);
      // History is automatically saved by the backend
    } catch (error) {
      const errorMsg = String(error);
      setError(errorMsg);
      addLog(`执行失败: ${errorMsg}`);
      // History is automatically saved by the backend
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    editorRef.current = value || "";
  };

  const handleEditorMount = (editor: any, monaco: any) => {
    monacoEditorRef.current = editor;
    // Add keyboard shortcut: Ctrl+Enter to execute
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      handleExecute();
    });
    // Load SQL if there's one to load
    if (sqlToLoad) {
      editor.setValue(sqlToLoad);
      editorRef.current = sqlToLoad;
      clearSqlToLoad();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">SQL 编辑器</span>
          {currentConnection && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">|</span>
              <span className="text-gray-300 font-medium">{currentConnection.name}</span>
              <span className="text-gray-500">({currentConnection.type.toUpperCase()})</span>
              {currentConnection.config.database && (
                <>
                  <span className="text-gray-500">|</span>
                  <span className="text-gray-400">数据库: {currentConnection.config.database}</span>
                </>
              )}
            </div>
          )}
        </div>
        <button
          onClick={handleExecute}
          disabled={!currentConnectionId}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium"
        >
          执行 (Ctrl+Enter)
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="sql"
          theme="vs-dark"
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            roundedSelection: false,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: "on",
          }}
        />
      </div>
    </div>
  );
}

