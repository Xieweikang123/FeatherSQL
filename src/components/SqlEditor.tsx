import { useRef, useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { useConnectionStore } from "../store/connectionStore";
import { executeSql, listTables, describeTable, type ColumnInfo } from "../lib/commands";

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
  const monacoRef = useRef<any>(null);
  const isEditorMountedRef = useRef<boolean>(false);
  const { 
    connections, 
    currentConnectionId, 
    currentDatabase, 
    getCurrentTab,
    updateTab,
    setSelectedTable, 
    addLog, 
    saveWorkspaceState 
  } = useConnectionStore();
  
  // 获取当前标签页
  const currentTab = getCurrentTab();
  const sqlToLoad = currentTab?.sqlToLoad || null;
  const selectedTable = currentTab?.selectedTable || null;
  
  // Schema cache for autocomplete
  const [tables, setTables] = useState<string[]>([]);
  const [tableColumns, setTableColumns] = useState<Map<string, ColumnInfo[]>>(new Map());
  const tablesRef = useRef<string[]>([]);
  const tableColumnsRef = useRef<Map<string, ColumnInfo[]>>(new Map());
  
  // Get current connection info
  const currentConnection = connections.find(c => c.id === currentConnectionId);
  
  // Get language mode based on current connection type
  const editorLanguage = getLanguageForDbType(currentConnection?.type);
  
  // Load tables when connection or database changes
  useEffect(() => {
    if (!currentConnectionId) {
      setTables([]);
      setTableColumns(new Map());
      tablesRef.current = [];
      tableColumnsRef.current = new Map();
      return;
    }

    const loadTables = async () => {
      try {
        const dbParam = currentConnection?.type === "sqlite" ? undefined : (currentDatabase || undefined);
        const tableList = await listTables(currentConnectionId, dbParam);
        setTables(tableList);
        tablesRef.current = tableList;
        
        // Preload columns for all tables (optional, can be lazy loaded)
        // For now, we'll load columns on demand in the completion provider
      } catch (error) {
        console.error("Failed to load tables for autocomplete:", error);
        setTables([]);
        tablesRef.current = [];
      }
    };

    loadTables();
  }, [currentConnectionId, currentDatabase, currentConnection?.type]);

  // Update editor content when tab changes
  useEffect(() => {
    if (!currentTab || !monacoEditorRef.current) return;
    
    const currentSql = currentTab.sql || "";
    if (editorRef.current !== currentSql) {
      monacoEditorRef.current.setValue(currentSql);
      editorRef.current = currentSql;
    }
  }, [currentTab?.id, currentTab?.sql]);
  
  // Load columns for a specific table
  const loadTableColumns = async (tableName: string) => {
    if (tableColumnsRef.current.has(tableName)) {
      return tableColumnsRef.current.get(tableName)!;
    }

    if (!currentConnectionId) {
      return [];
    }

    try {
      const dbParam = currentConnection?.type === "sqlite" ? undefined : (currentDatabase || undefined);
      const columns = await describeTable(currentConnectionId, tableName, dbParam);
      const newMap = new Map(tableColumnsRef.current);
      newMap.set(tableName, columns);
      setTableColumns(newMap);
      tableColumnsRef.current = newMap;
      return columns;
    } catch (error) {
      console.error(`Failed to load columns for table ${tableName}:`, error);
      return [];
    }
  };
  
  // Store loadTableColumns in a ref so completion provider can access it
  const loadTableColumnsRef = useRef(loadTableColumns);
  loadTableColumnsRef.current = loadTableColumns;

  // Update editor language when connection changes
  useEffect(() => {
    if (monacoEditorRef.current && monacoRef.current && currentConnection) {
      const language = getLanguageForDbType(currentConnection.type);
      const model = monacoEditorRef.current.getModel();
      if (model) {
        // Update language without losing content using Monaco API
        monacoRef.current.editor.setModelLanguage(model, language);
      }
    }
  }, [currentConnectionId, currentConnection?.type]);

  // Load SQL from history when sqlToLoad changes
  useEffect(() => {
    if (!sqlToLoad || !currentTab) return;

    // If editor is already mounted, load immediately
    if (isEditorMountedRef.current && monacoEditorRef.current) {
      monacoEditorRef.current.setValue(sqlToLoad);
      editorRef.current = sqlToLoad;
      updateTab(currentTab.id, { sqlToLoad: null, sql: sqlToLoad });
    }
    // If editor is not mounted yet, wait for onMount event to handle it
  }, [sqlToLoad, currentTab, updateTab]);

  const handleExecute = async () => {
    if (!currentConnectionId || !currentTab) {
      if (currentTab) {
        updateTab(currentTab.id, { error: "请先选择一个连接" });
      }
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
      updateTab(currentTab.id, { error: "SQL 查询不能为空" });
      return;
    }

    updateTab(currentTab.id, { error: null, isQuerying: true });
    addLog(`执行 SQL: ${sql.substring(0, 50)}...`);

    try {
      const result = await executeSql(currentConnectionId, sql, currentDatabase || undefined);
      updateTab(currentTab.id, { 
        queryResult: result, 
        error: null, 
        isQuerying: false,
        sql: sql 
      });
      addLog(`查询成功，返回 ${result.rows.length} 行`);
      // Save current SQL to workspace state after successful execution
      saveWorkspaceState();
      // History is automatically saved by the backend
    } catch (error) {
      const errorMsg = String(error);
      updateTab(currentTab.id, { 
        error: errorMsg, 
        queryResult: null,
        isQuerying: false,
        sql: sql 
      });
      addLog(`执行失败: ${errorMsg}`);
      // Save current SQL to workspace state even on error (user might want to retry)
      saveWorkspaceState();
      // History is automatically saved by the backend
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    const sql = value || "";
    editorRef.current = sql;
    // Save SQL to current tab
    if (currentTab) {
      updateTab(currentTab.id, { sql });
    }
  };

  const handleEditorMount = (editor: any, monaco: any) => {
    monacoEditorRef.current = editor;
    monacoRef.current = monaco;
    isEditorMountedRef.current = true;
    
    // Add keyboard shortcut: Ctrl+Enter to execute
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      handleExecute();
    });
    
    // Helper function to extract table name from SQL (handles backticks and database prefix)
    const extractTableName = (tableRef: string): string | null => {
      // Remove backticks
      let cleaned = tableRef.replace(/`/g, '');
      // Handle database.table format
      const parts = cleaned.split('.');
      // Return the table name (last part)
      return parts.length > 0 ? parts[parts.length - 1] : null;
    };

    // Helper function to parse FROM clause and find table names
    const parseFromClause = (sqlText: string): string[] => {
      const tables: string[] = [];
      // Match FROM clause - handle backticks, database prefix, etc.
      // Pattern: FROM `db`.`table` or FROM table or FROM table alias
      const fromMatch = sqlText.match(/FROM\s+([^WHERE|JOIN|ORDER|GROUP|HAVING|LIMIT]+)/i);
      if (fromMatch) {
        const fromPart = fromMatch[1].trim();
        // Split by comma for multiple tables
        const tableRefs = fromPart.split(',').map(t => t.trim());
        for (const tableRef of tableRefs) {
          // Remove alias if present (table AS alias or table alias)
          const aliasMatch = tableRef.match(/^(.+?)(?:\s+(?:AS\s+)?\w+)?$/i);
          if (aliasMatch) {
            const tableName = extractTableName(aliasMatch[1].trim());
            if (tableName) {
              tables.push(tableName);
            }
          }
        }
      }
      return tables;
    };

    // Register custom completion provider for SQL
    const completionProvider = {
      provideCompletionItems: async (model: any, position: any, context: any) => {
        // 严格检查：只在手动触发（Ctrl+Space）或触发字符（点号）时提供建议
        const isManualInvoke = context.triggerKind === monaco.languages.CompletionTriggerKind.Invoke;
        const isTriggerCharacter = context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter;
        
        // 如果不是手动触发也不是触发字符，直接返回空建议
        if (!isManualInvoke && !isTriggerCharacter) {
          return { suggestions: [] };
        }
        
        // 如果是触发字符，检查是否是点号
        if (isTriggerCharacter && context.triggerCharacter !== '.') {
          return { suggestions: [] };
        }
        const textUntilPosition = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: any[] = [];
        const seenLabels = new Set<string>(); // For deduplication
        
        // Helper to add suggestion with deduplication
        const addSuggestion = (item: any) => {
          if (!seenLabels.has(item.label)) {
            seenLabels.add(item.label);
            suggestions.push(item);
          }
        };
        
        // Determine context - are we in SELECT, FROM, WHERE, etc.?
        const text = textUntilPosition;
        const textUpper = text.toUpperCase();
        const lastWords = textUpper.trim().split(/\s+/).slice(-5);
        const currentWord = word.word.toUpperCase();
        
        // Check if we're in SELECT clause (before FROM)
        const selectIndex = textUpper.lastIndexOf('SELECT');
        const fromIndex = textUpper.lastIndexOf('FROM');
        const isInSelectClause = selectIndex !== -1 && (fromIndex === -1 || selectIndex > fromIndex);
        
        // Check if we're right after FROM or JOIN
        const isAfterFrom = lastWords[lastWords.length - 1] === 'FROM' || 
                           lastWords[lastWords.length - 1] === 'JOIN' ||
                           lastWords[lastWords.length - 1] === 'INNER' ||
                           lastWords[lastWords.length - 1] === 'LEFT' ||
                           lastWords[lastWords.length - 1] === 'RIGHT' ||
                           lastWords[lastWords.length - 1] === 'FULL';
        
        // Parse FROM clause to get table names
        const fromTables = parseFromClause(text);
        
        // SQL Keywords - 只在手动触发时显示，或者当前单词是字母开头且长度>=2
        // 避免在输入数字时触发（如输入 "1" 时不应该显示建议）
        const isNumber = currentWord && /^\d+$/.test(currentWord);
        const shouldShowKeywords = isManualInvoke || 
          (currentWord && /^[A-Za-z]/.test(currentWord) && currentWord.length >= 2) ||
          (isAfterFrom && !isNumber);
        
        if (shouldShowKeywords) {
          const sqlKeywords = [
            'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN',
            'ON', 'AS', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS NULL', 'IS NOT NULL',
            'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'TOP', 'DISTINCT', 'UNION', 'UNION ALL',
            'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP',
            'INDEX', 'PRIMARY KEY', 'FOREIGN KEY', 'CONSTRAINT', 'DEFAULT', 'NULL', 'NOT NULL',
            'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'CAST', 'CONVERT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'
          ];
          
          sqlKeywords.forEach(keyword => {
            if (isManualInvoke || !currentWord || keyword.toUpperCase().startsWith(currentWord)) {
              addSuggestion({
                label: keyword,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: keyword,
                range: range,
                detail: 'SQL 关键字',
              });
            }
          });
        }
        
        // After FROM, JOIN - suggest table names (only current database tables)
        // 只在手动触发或触发字符时显示，避免在输入数字时触发
        if (isAfterFrom && (isManualInvoke || isTriggerCharacter) && !isNumber) {
          tablesRef.current.forEach(table => {
            if (isManualInvoke || !currentWord || table.toUpperCase().startsWith(currentWord)) {
              addSuggestion({
                label: table,
                kind: monaco.languages.CompletionItemKind.Class,
                insertText: table,
                range: range,
                detail: '表',
                documentation: `表: ${table}`,
              });
            }
          });
        }
        
        // In SELECT clause or WHERE/ORDER BY/etc - suggest columns
        // 只在手动触发或触发字符时显示，避免在输入数字时触发
        if ((isInSelectClause || 
            lastWords.includes('WHERE') || 
            lastWords.includes('ORDER') || 
            lastWords.includes('GROUP') ||
            lastWords.includes('HAVING') || 
            lastWords.includes('ON')) && 
            (isManualInvoke || isTriggerCharacter) && !isNumber) {
          
          // Priority 1: If we have FROM tables, show their columns first (without table prefix)
          if (fromTables.length > 0) {
            for (const tableName of fromTables) {
              // Only load if table exists in current database
              if (tablesRef.current.includes(tableName)) {
                const columns = await loadTableColumnsRef.current(tableName);
                columns.forEach(col => {
                  // In SELECT clause, prefer column name without table prefix
                  const label = isInSelectClause ? col.name : `${tableName}.${col.name}`;
                  if (isManualInvoke || !currentWord || col.name.toUpperCase().startsWith(currentWord)) {
                    addSuggestion({
                      label: label,
                      kind: monaco.languages.CompletionItemKind.Field,
                      insertText: isInSelectClause ? col.name : `${tableName}.${col.name}`,
                      range: range,
                      detail: `列 (${col.data_type})`,
                      documentation: `${tableName}.${col.name}: ${col.data_type}${col.primary_key ? ' [主键]' : ''}${col.nullable ? '' : ' [非空]'}`,
                      sortText: isInSelectClause ? `0${col.name}` : `1${tableName}.${col.name}`, // Prioritize columns from FROM table
                    });
                  }
                });
              }
            }
          }
          
          // Priority 2: If no FROM tables found or in WHERE/ORDER BY, show columns from all tables (with table prefix)
          // Only if we haven't found columns from FROM clause
          if (fromTables.length === 0 || !isInSelectClause) {
            // Limit to avoid too many suggestions
            const tablesToLoad = tablesRef.current.slice(0, 3);
            for (const table of tablesToLoad) {
              // Skip if already loaded from FROM clause
              if (fromTables.includes(table)) continue;
              
              const columns = await loadTableColumnsRef.current(table);
              columns.forEach(col => {
                const label = `${table}.${col.name}`;
                if (isManualInvoke || !currentWord || col.name.toUpperCase().startsWith(currentWord)) {
                  addSuggestion({
                    label: label,
                    kind: monaco.languages.CompletionItemKind.Field,
                    insertText: label,
                    range: range,
                    detail: `列 (${col.data_type})`,
                    documentation: `${table}.${col.name}: ${col.data_type}`,
                    sortText: `2${label}`, // Lower priority
                  });
                }
              });
            }
          }
        }

        return {
          suggestions: suggestions.sort((a, b) => {
            // First sort by sortText if available (for priority)
            if (a.sortText && b.sortText) {
              return a.sortText.localeCompare(b.sortText);
            }
            // Then sort by kind: keywords first, then tables, then columns
            const aKind = a.kind === monaco.languages.CompletionItemKind.Keyword ? 0 :
                         a.kind === monaco.languages.CompletionItemKind.Class ? 1 : 2;
            const bKind = b.kind === monaco.languages.CompletionItemKind.Keyword ? 0 :
                         b.kind === monaco.languages.CompletionItemKind.Class ? 1 : 2;
            if (aKind !== bKind) {
              return aKind - bKind;
            }
            // Finally sort alphabetically
            return a.label.localeCompare(b.label);
          }),
        };
      },
      triggerCharacters: ['.'], // 移除空格，只在输入点号时触发
    };

    // Register completion provider
    const disposable = monaco.languages.registerCompletionItemProvider(
      editorLanguage,
      completionProvider
    );
    
    // Load SQL from current tab
    const store = useConnectionStore.getState();
    const currentTab = store.getCurrentTab();
    if (currentTab) {
      const sqlToLoad = currentTab.sqlToLoad || currentTab.sql;
      if (sqlToLoad) {
        editor.setValue(sqlToLoad);
        editorRef.current = sqlToLoad;
        if (currentTab.sqlToLoad) {
          store.updateTab(currentTab.id, { sqlToLoad: null });
        }
      }
    }

    // Return cleanup function
    return () => {
      disposable.dispose();
    };
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
          className="px-5 py-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold neu-raised"
          style={{ 
            color: 'var(--neu-accent-dark)',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
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
            suggestOnTriggerCharacters: true,
            quickSuggestions: false, // 完全关闭自动提示
            acceptSuggestionOnCommitCharacter: false, // 避免自动接受
            acceptSuggestionOnEnter: "smart", // 智能接受，只在明确选择时接受
            tabCompletion: "off", // 关闭 Tab 补全，避免干扰
            quickSuggestionsDelay: 1000, // 增加延迟
            // suggestSelection 不支持 "never"，移除此项
            wordBasedSuggestions: "off", // 关闭基于单词的建议
            snippetSuggestions: "top", // 代码片段建议置顶
            parameterHints: {
              enabled: false, // 关闭参数提示
            },
          }}
        />
      </div>
    </div>
  );
}

