import { useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { useConnectionStore } from "../store/connectionStore";
import { executeSql } from "../lib/commands";

// Map database type to Monaco Editor language
function getLanguageForDbType(dbType: string | undefined): string {
  switch (dbType) {
    case "mysql":
      return "mysql";
    case "postgres":
      return "pgsql";
    case "mssql":
      return "mssql";
    case "sqlite":
    default:
      return "sql";
  }
}

export default function SqlEditor() {
  const editorRef = useRef<string>("");
  const monacoEditorRef = useRef<any>(null);
  const { connections, currentConnectionId, currentDatabase, selectedTable, setSelectedTable, setQueryResult, setError, addLog, sqlToLoad, clearSqlToLoad, setSavedSql, setIsQuerying, saveWorkspaceState } =
    useConnectionStore();
  
  // Get current connection info
  const currentConnection = connections.find(c => c.id === currentConnectionId);
  
  // Get language mode based on current connection type
  const editorLanguage = getLanguageForDbType(currentConnection?.type);

  // Update editor language when connection changes
  useEffect(() => {
    if (monacoEditorRef.current && currentConnection) {
      const language = getLanguageForDbType(currentConnection.type);
      const model = monacoEditorRef.current.getModel();
      if (model) {
        // Update language without losing content
        monacoEditorRef.current.setModelLanguage(model, language);
      }
    }
  }, [currentConnectionId, currentConnection?.type]);

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
      // Save current SQL to workspace state after successful execution
      setSavedSql(sql);
      saveWorkspaceState();
      // History is automatically saved by the backend
    } catch (error) {
      const errorMsg = String(error);
      setError(errorMsg);
      addLog(`执行失败: ${errorMsg}`);
      // Save current SQL to workspace state even on error (user might want to retry)
      setSavedSql(sql);
      saveWorkspaceState();
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
      <div className="flex items-center justify-between px-5 py-3 neu-raised" style={{ borderBottom: '1px solid var(--neu-dark)' }}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {selectedTable && (
            <button
              onClick={() => setSelectedTable(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
              style={{ color: 'var(--neu-text)' }}
              title="返回表视图"
            >
              <span>←</span>
              <span>返回</span>
            </button>
          )}
          <span className="text-sm font-semibold" style={{ color: 'var(--neu-text)' }}>SQL 编辑器</span>
          {currentConnection && (
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span style={{ color: 'var(--neu-text-light)' }}>|</span>
              <span className="font-medium px-2 py-0.5 neu-flat rounded" style={{ color: 'var(--neu-text)' }}>{currentConnection.name}</span>
              <span className="uppercase tracking-wide" style={{ color: 'var(--neu-text-light)' }}>({currentConnection.type})</span>
              {currentDatabase && (
                <>
                  <span style={{ color: 'var(--neu-text-light)' }}>|</span>
                  <span className="font-medium px-2 py-0.5 neu-flat rounded" style={{ color: 'var(--neu-accent)' }}>数据库: {currentDatabase}</span>
                </>
              )}
              {selectedTable && (
                <>
                  <span style={{ color: 'var(--neu-text-light)' }}>|</span>
                  <span className="font-medium px-2 py-0.5 neu-flat rounded" style={{ color: 'var(--neu-success)' }}>表: {selectedTable}</span>
                </>
              )}
            </div>
          )}
        </div>
        <button
          onClick={handleExecute}
          disabled={!currentConnectionId}
          className="px-5 py-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-all duration-200 neu-raised hover:neu-hover active:neu-active disabled:hover:neu-raised"
          style={{ color: 'var(--neu-accent-dark)' }}
        >
          执行 (Ctrl+Enter)
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={editorLanguage}
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

