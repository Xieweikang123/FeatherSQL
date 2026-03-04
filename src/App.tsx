import { useEffect, useState, useRef, useCallback } from "react";
import ConnectionManager from "./components/ConnectionManager";
import SqlEditor from "./components/SqlEditor";
import ResultTable from "./components/ResultTable";
import SqlHistory from "./components/SqlHistory";
import TableView from "./components/TableView";
import TabBar from "./components/TabBar";
import { useConnectionStore } from "./store/connectionStore";
import { getConnections } from "./lib/commands";

const EDITOR_HEIGHT_RATIO_KEY = "feathersql_editor_height_ratio";
const SIDEBAR_WIDTH_KEY = "feathersql_sidebar_width";
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 400;
const SIDEBAR_DEFAULT_WIDTH = 260;

function App() {
  const { 
    setConnections, 
    currentConnectionId, 
    currentDatabase, 
    getCurrentTab,
  } = useConnectionStore();
  
  // 获取当前标签页状态
  const currentTab = getCurrentTab();
  const queryResult = currentTab?.queryResult || null;
  const error = currentTab?.error || null;
  const isQuerying = currentTab?.isQuerying || false;
  const savedSql = currentTab?.sql || null;
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [editorHeight, setEditorHeight] = useState<number | null>(null);
  const [editorHeightRatio, setEditorHeightRatio] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(SIDEBAR_DEFAULT_WIDTH);
  const [isSidebarDragging, setIsSidebarDragging] = useState(false);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number>(0);
  const dragStartHeight = useRef<number>(0);
  const dragStartX = useRef<number>(0);
  const dragStartSidebarWidth = useRef<number>(0);
  const currentSidebarWidthRef = useRef<number>(SIDEBAR_DEFAULT_WIDTH);

  useEffect(() => {
    // Load connections on mount
    // The backend handles all error cases gracefully and returns empty array if needed
    getConnections()
      .then((connections) => {
        setConnections(connections);
        // Auto-restore is disabled - user can manually restore from history if needed
      })
      .catch((err) => {
        console.error("Failed to load connections:", err);
        // Set empty connections array to allow app to continue
        setConnections([]);
      });
  }, [setConnections]);

  // Load saved editor height ratio from localStorage
  useEffect(() => {
    const savedRatio = localStorage.getItem(EDITOR_HEIGHT_RATIO_KEY);
    if (savedRatio) {
      const ratio = parseFloat(savedRatio);
      if (!isNaN(ratio) && ratio > 0 && ratio < 1) {
        setEditorHeightRatio(ratio);
      }
    }
  }, []);

  // Load saved sidebar width from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (saved) {
      const w = parseInt(saved, 10);
      if (!isNaN(w) && w >= SIDEBAR_MIN_WIDTH && w <= SIDEBAR_MAX_WIDTH) {
        setSidebarWidth(w);
      }
    }
  }, []);

  // Apply saved ratio when container is ready or window resizes
  useEffect(() => {
    const updateHeight = () => {
      // Don't update during dragging - user is manually adjusting
      if (isDragging) return;
      
      if (editorHeightRatio !== null && mainContentRef.current) {
        const containerHeight = mainContentRef.current.clientHeight;
        const height = containerHeight * editorHeightRatio;
        setEditorHeight(height);
      }
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, [editorHeightRatio, isDragging]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    if (mainContentRef.current) {
      const rect = mainContentRef.current.getBoundingClientRect();
      const currentEditorHeight = editorHeight ?? rect.height * 0.6;
      dragStartHeight.current = currentEditorHeight;
    }
  }, [editorHeight]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !mainContentRef.current) return;

      const deltaY = e.clientY - dragStartY.current;
      const newHeight = dragStartHeight.current + deltaY;
      const containerHeight = mainContentRef.current.clientHeight;

      // Constrain height between 20% and 80% of container
      const minHeight = containerHeight * 0.2;
      const maxHeight = containerHeight * 0.8;
      const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

      setEditorHeight(constrainedHeight);

      // Save ratio in real-time during drag
      const ratio = constrainedHeight / containerHeight;
      setEditorHeightRatio(ratio);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      // Calculate and save the ratio directly using current editorHeight
      if (mainContentRef.current && editorHeight !== null) {
        const containerHeight = mainContentRef.current.clientHeight;
        const ratio = editorHeight / containerHeight;
        localStorage.setItem(EDITOR_HEIGHT_RATIO_KEY, ratio.toString());
        setEditorHeightRatio(ratio);
      }
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, editorHeight]);

  const handleSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsSidebarDragging(true);
    dragStartX.current = e.clientX;
    dragStartSidebarWidth.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    currentSidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isSidebarDragging) return;
      const deltaX = e.clientX - dragStartX.current;
      const newWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, dragStartSidebarWidth.current + deltaX));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (isSidebarDragging) {
        setIsSidebarDragging(false);
        localStorage.setItem(SIDEBAR_WIDTH_KEY, currentSidebarWidthRef.current.toString());
      }
    };
    if (isSidebarDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isSidebarDragging, sidebarWidth]);

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--neu-bg)', color: 'var(--neu-text)' }}>
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-3 neu-raised" style={{ borderBottom: '1px solid var(--neu-dark)' }}>
        <h1 className="text-xl font-bold" style={{ 
          background: 'linear-gradient(135deg, var(--neu-accent-light) 0%, var(--neu-accent) 50%, var(--neu-accent-dark) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          textShadow: '0 0 20px rgba(91, 155, 213, 0.3)',
          filter: 'drop-shadow(0 0 2px rgba(91, 155, 213, 0.5))'
        }}>
          FeatherSQL
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setHistoryExpanded(!historyExpanded)}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-all duration-200 neu-hover neu-active ${
              historyExpanded
                ? "neu-pressed"
                : "neu-flat"
            }`}
            style={{ color: historyExpanded ? 'var(--neu-accent-dark)' : 'var(--neu-text)' }}
          >
            {historyExpanded ? "隐藏历史" : "显示历史"}
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 neu-flat rounded-lg">
            <div
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                currentConnectionId 
                  ? "animate-pulse" 
                  : ""
              }`}
              style={{ 
                backgroundColor: currentConnectionId ? 'var(--neu-success)' : 'rgba(255, 255, 255, 0.1)',
                boxShadow: currentConnectionId 
                  ? '0 0 10px var(--neu-success), 0 0 20px rgba(102, 187, 106, 0.3)' 
                  : 'inset 0 0 4px rgba(0, 0, 0, 0.5)'
              }}
            />
            <span className="text-sm font-medium" style={{ color: 'var(--neu-text)' }}>
              {currentConnectionId ? "已连接" : "未连接"}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Connections */}
        <aside 
          className="flex flex-col flex-shrink-0" 
          style={{ 
            width: sidebarWidth,
            minWidth: sidebarWidth,
            maxWidth: sidebarWidth,
            background: 'var(--neu-bg)',
            borderRight: '1px solid rgba(255, 255, 255, 0.04)',
            boxShadow: '1px 0 4px rgba(0, 0, 0, 0.2)',
          }}
        >
          <ConnectionManager />
        </aside>

        {/* Left sidebar resizer - 拖拽调整左侧宽度 */}
        <div
          onMouseDown={handleSidebarMouseDown}
          className="group flex-shrink-0 cursor-col-resize flex items-center justify-center hover:bg-black/10"
          style={{ 
            width: 8,
            minWidth: 8,
            backgroundColor: isSidebarDragging ? 'rgba(91, 155, 213, 0.15)' : undefined,
            transition: 'background-color 0.15s',
          }}
          title="拖拽调整宽度"
        >
          <div 
            className="w-px h-10 rounded-full transition-colors duration-150"
            style={{ 
              backgroundColor: isSidebarDragging ? 'var(--neu-accent)' : 'rgba(255, 255, 255, 0.06)',
            }}
          />
        </div>

        {/* Main content */}
        <main ref={mainContentRef} className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Tab Bar - 始终显示 */}
          <TabBar />
          
          {/* 始终显示 SQL 编辑器 */}
          <>
            {/* SQL Editor */}
            <div 
              className="flex flex-col min-h-0"
              style={{ 
                height: editorHeight !== null ? `${editorHeight}px` : undefined,
                flex: editorHeight === null ? 1 : undefined
              }}
            >
              <SqlEditor />
            </div>

            {/* Resizable divider */}
            <div
              onMouseDown={handleMouseDown}
              className={`h-1.5 cursor-row-resize transition-all duration-200 group neu-flat ${
                isDragging ? "" : ""
              }`}
              style={{ 
                flexShrink: 0,
                backgroundColor: isDragging ? 'var(--neu-accent)' : 'var(--neu-bg)'
              }}
            >
              <div className="h-full w-full flex items-center justify-center">
                <div className={`w-16 h-1 rounded-full transition-all duration-200 ${
                  isDragging 
                    ? "" 
                    : ""
                }`} 
                style={{ 
                  backgroundColor: isDragging ? 'var(--neu-accent-light)' : 'rgba(255, 255, 255, 0.1)',
                  boxShadow: isDragging ? '0 0 4px var(--neu-accent)' : 'none'
                }} />
              </div>
            </div>

            {/* Result Table or TableView */}
            <div 
              className="overflow-auto neu-flat"
              style={{ 
                flex: editorHeight !== null ? 1 : undefined,
                height: editorHeight !== null ? undefined : "256px",
                borderTop: '1px solid var(--neu-dark)'
              }}
            >
              {error ? (
                <div className="p-4 neu-pressed rounded-lg m-4" style={{ 
                  borderLeft: '4px solid var(--neu-error)',
                  color: 'var(--neu-error)'
                }}>
                  <div className="font-semibold mb-1">错误:</div>
                  <div className="text-sm">{error}</div>
                </div>
              ) : isQuerying ? (
                <div className="p-8 text-center" style={{ color: 'var(--neu-text-light)' }}>
                  <div className="flex justify-center mb-3">
                    <svg className="animate-spin h-8 w-8" style={{ color: 'var(--neu-accent)' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                  <div className="text-sm">查询中...</div>
                </div>
              ) : queryResult ? (
                <ResultTable result={queryResult} sql={savedSql} />
              ) : currentConnectionId && currentDatabase !== null && currentTab?.name !== "新查询" ? (
                // 选中数据库且非新建查询页时：显示数据表视图
                <TableView />
              ) : (
                <div className="p-8 text-center" style={{ color: 'var(--neu-text-light)' }}>
                  <div className="text-4xl mb-3 opacity-50">📊</div>
                  <div className="text-sm">执行 SQL 查询以查看结果</div>
                  {!currentConnectionId && (
                    <div className="mt-4 text-xs opacity-70">请先选择一个连接和数据库</div>
                  )}
                </div>
              )}
            </div>
          </>
        </main>

        {/* Right sidebar - History */}
        {historyExpanded && (
          <aside 
            className="w-80 flex flex-col flex-shrink-0" 
            style={{ 
              background: 'var(--neu-bg)',
              boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.15), inset -1px 0 0 rgba(255, 255, 255, 0.03)',
            }}
          >
            <SqlHistory />
          </aside>
        )}
      </div>
    </div>
  );
}

export default App;

