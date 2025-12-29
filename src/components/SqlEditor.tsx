import { useRef } from "react";
import Editor from "@monaco-editor/react";
import { useConnectionStore } from "../store/connectionStore";
import { executeSql } from "../lib/commands";

export default function SqlEditor() {
  const editorRef = useRef<string>("");
  const { currentConnectionId, setQueryResult, setError, addLog } =
    useConnectionStore();

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
    } catch (error) {
      const errorMsg = String(error);
      setError(errorMsg);
      addLog(`执行失败: ${errorMsg}`);
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    editorRef.current = value || "";
  };

  const handleEditorMount = (editor: any, monaco: any) => {
    // Add keyboard shortcut: Ctrl+Enter to execute
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      handleExecute();
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <span className="text-sm text-gray-400">SQL 编辑器</span>
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

