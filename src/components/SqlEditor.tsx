import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "@codemirror/basic-setup";
import { EditorState } from "@codemirror/state";
import { sql } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { useConnectionStore } from "../store/connectionStore";
import { executeSql } from "../lib/commands";

export default function SqlEditor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { currentConnectionId, setQueryResult, setError, addLog } =
    useConnectionStore();

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: "",
      extensions: [
        basicSetup,
        sql(),
        oneDark,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            // Handle content changes if needed
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    // Handle keyboard shortcut: Cmd/Ctrl+Enter
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        handleExecute();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      view.destroy();
    };
  }, []);

  const handleExecute = async () => {
    if (!currentConnectionId) {
      setError("请先选择一个连接");
      addLog("执行失败: 未选择连接");
      return;
    }

    if (!viewRef.current) return;

    const sql = viewRef.current.state.doc.toString().trim();
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
      <div ref={editorRef} className="flex-1 overflow-hidden" />
    </div>
  );
}

