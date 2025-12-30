import { useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { useConnectionStore } from "../store/connectionStore";
import { executeSql } from "../lib/commands";

export default function SqlEditor() {
  const editorRef = useRef<string>("");
  const monacoEditorRef = useRef<any>(null);
  const { connections, currentConnectionId, currentDatabase, selectedTable, setSelectedTable, setQueryResult, setError, addLog, sqlToLoad, clearSqlToLoad, setSavedSql, setIsQuerying } =
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

    // Get selected text if any, otherwise use all text
    let sql = "";
    if (monacoEditorRef.current) {
      const selection = monacoEditorRef.current.getSelection();
      if (selection && !selection.isEmpty()) {
        // Execute selected text
        sql = monacoEditorRef.current.getModel()?.getValueInRange(selection) || "";
      } else {
        // No selection, execute all text
        sql = editorRef.current;
      }
    } else {
      sql = editorRef.current;
    }

    sql = sql.trim();
    if (!sql) {
      setError("SQL 查询不能为空");
      return;
    }

    setError(null);
    setIsQuerying(true);
    addLog(`执行 SQL: ${sql.substring(0, 50)}...`);

    try {
      const result = await executeSql(currentConnectionId, sql, currentDatabase || undefined);
      setQueryResult(result);
      addLog(`查询成功，返回 ${result.rows.length} 行`);
      // History is automatically saved by the backend
    } catch (error) {
      const errorMsg = String(error);
      setError(errorMsg);
      addLog(`执行失败: ${errorMsg}`);
      // History is automatically saved by the backend
    } finally {
      setIsQuerying(false);
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    const sql = value || "";
    editorRef.current = sql;
    // Save SQL to store for workspace state persistence
    setSavedSql(sql);
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
      <div className="flex items-center justify-between px-5 py-3 bg-gray-900/95 border-b border-gray-800/80 backdrop-blur-sm shadow-sm">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {selectedTable && (
            <button
              onClick={() => setSelectedTable(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800/80 rounded-lg transition-all duration-200 border border-gray-700/50 hover:border-gray-600/50 hover:scale-105 active:scale-95"
              title="返回表视图"
            >
              <span>←</span>
              <span>返回</span>
            </button>
          )}
          <span className="text-sm text-gray-300 font-semibold">SQL 编辑器</span>
          {currentConnection && (
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="text-gray-600">|</span>
              <span className="text-gray-200 font-medium px-2 py-0.5 bg-gray-800/60 rounded">{currentConnection.name}</span>
              <span className="text-gray-500 uppercase tracking-wide">({currentConnection.type})</span>
              {currentDatabase && (
                <>
                  <span className="text-gray-600">|</span>
                  <span className="text-blue-400 font-medium px-2 py-0.5 bg-blue-500/10 rounded">数据库: {currentDatabase}</span>
                </>
              )}
              {selectedTable && (
                <>
                  <span className="text-gray-600">|</span>
                  <span className="text-green-400 font-medium px-2 py-0.5 bg-green-500/10 rounded">表: {selectedTable}</span>
                </>
              )}
            </div>
          )}
        </div>
        <button
          onClick={handleExecute}
          disabled={!currentConnectionId}
          className="px-5 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-700 disabled:to-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-all duration-200 shadow-md shadow-blue-600/30 hover:shadow-lg hover:shadow-blue-600/40 hover:scale-105 active:scale-95"
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

