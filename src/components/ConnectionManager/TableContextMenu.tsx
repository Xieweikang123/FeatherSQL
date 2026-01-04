import React, { useEffect, useRef } from "react";

interface TableContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onViewStructure: () => void;
  onQueryTable: () => void;
  onGenerateSelect: () => void;
}

export default function TableContextMenu({
  x,
  y,
  onClose,
  onViewStructure,
  onQueryTable,
  onGenerateSelect,
}: TableContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    // 延迟添加事件监听，避免立即触发点击外部事件
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // 确保菜单在视口内
  const [adjustedX, adjustedY] = React.useMemo(() => {
    if (!menuRef.current) return [x, y];
    
    const menuWidth = 200;
    const menuHeight = 150;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let finalX = x;
    let finalY = y;
    
    if (x + menuWidth > viewportWidth) {
      finalX = viewportWidth - menuWidth - 10;
    }
    if (y + menuHeight > viewportHeight) {
      finalY = viewportHeight - menuHeight - 10;
    }
    
    return [Math.max(10, finalX), Math.max(10, finalY)];
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="fixed neu-raised rounded-lg shadow-lg py-1 z-50"
      style={{
        left: `${adjustedX}px`,
        top: `${adjustedY}px`,
        minWidth: "180px",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="w-full px-4 py-2 text-left text-sm hover:neu-hover transition-colors"
        style={{ color: "var(--neu-text)" }}
        onClick={() => {
          onQueryTable();
          onClose();
        }}
      >
        🔍 查询表数据
      </button>
      <button
        className="w-full px-4 py-2 text-left text-sm hover:neu-hover transition-colors"
        style={{ color: "var(--neu-text)" }}
        onClick={() => {
          onViewStructure();
          onClose();
        }}
      >
        📋 查看表结构
      </button>
      <button
        className="w-full px-4 py-2 text-left text-sm hover:neu-hover transition-colors"
        style={{ color: "var(--neu-text)" }}
        onClick={() => {
          onGenerateSelect();
          onClose();
        }}
      >
        📝 生成 SELECT 语句
      </button>
    </div>
  );
}

