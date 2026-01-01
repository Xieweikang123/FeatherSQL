import { useConnectionStore, type TabState } from "../store/connectionStore";

export default function TabBar() {
  const { tabs, currentTabId, setCurrentTab, closeTab, createTab } = useConnectionStore();

  const handleTabClick = (tabId: string) => {
    setCurrentTab(tabId);
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  const handleNewTab = () => {
    createTab();
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1 neu-flat overflow-x-auto" style={{ borderBottom: '1px solid var(--neu-dark)' }}>
      {tabs.map((tab) => {
        const isActive = tab.id === currentTabId;
        const hasError = tab.error !== null;
        const isQuerying = tab.isQuerying;
        
        return (
          <div
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-t-lg cursor-pointer transition-all duration-200 min-w-0 flex-shrink-0 ${
              isActive ? "neu-raised" : "neu-flat hover:neu-hover"
            }`}
            style={{
              borderBottom: isActive ? '2px solid var(--neu-accent)' : '2px solid transparent',
            }}
            title={tab.name}
          >
            {/* 状态指示器 */}
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {isQuerying ? (
                <svg className="animate-spin h-3 w-3 flex-shrink-0" style={{ color: 'var(--neu-accent)' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : hasError ? (
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--neu-error)' }} title="有错误"></span>
              ) : tab.queryResult ? (
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--neu-success)' }} title="查询成功"></span>
              ) : null}
              
              {/* 标签页名称 */}
              <span className="text-xs font-medium truncate" style={{ color: isActive ? 'var(--neu-text)' : 'var(--neu-text-light)' }}>
                {tab.name}
              </span>
            </div>

            {/* 关闭按钮 */}
            <button
              onClick={(e) => handleCloseTab(e, tab.id)}
              className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded transition-all duration-200 neu-flat hover:neu-hover active:neu-active flex-shrink-0"
              style={{ color: 'var(--neu-text-light)' }}
              title="关闭标签页"
            >
              <span className="text-xs">×</span>
            </button>
          </div>
        );
      })}
      
      {/* 新建标签页按钮 */}
      <button
        onClick={handleNewTab}
        className="px-2 py-1.5 rounded-lg transition-all duration-200 neu-flat hover:neu-hover active:neu-active flex-shrink-0"
        style={{ color: 'var(--neu-accent)' }}
        title="新建标签页"
      >
        <span className="text-sm font-bold">+</span>
      </button>
    </div>
  );
}

