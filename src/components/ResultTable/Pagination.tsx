interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalRows: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export default function Pagination({
  currentPage,
  totalPages,
  pageSize,
  totalRows,
  pageSizeOptions = [10, 20, 50, 100],
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const startRow = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, totalRows);

  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  const handleFirst = () => {
    if (currentPage > 1) {
      onPageChange(1);
    }
  };

  const handleLast = () => {
    if (currentPage < totalPages) {
      onPageChange(totalPages);
    }
  };

  // 生成页码按钮
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7; // 最多显示7个页码按钮

    if (totalPages <= maxVisible) {
      // 如果总页数少于等于最大可见数，显示所有页码
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 总是显示第一页
      pages.push(1);

      if (currentPage <= 3) {
        // 当前页在前3页
        for (let i = 2; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        // 当前页在后3页
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // 当前页在中间
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  if (totalRows === 0) {
    return null;
  }

  return (
    <div
      className="px-4 py-3 neu-flat flex items-center justify-between gap-4"
      style={{ borderTop: "1px solid var(--neu-dark)" }}
    >
      {/* 左侧：显示行数信息和每页行数选择 */}
      <div className="flex items-center gap-3">
        <span className="text-xs" style={{ color: "var(--neu-text-light)" }}>
          显示 {startRow}-{endRow} / 共 {totalRows} 条
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--neu-text-light)" }}>
            每页:
          </span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="px-2 py-1 text-xs rounded neu-pressed focus:outline-none transition-all duration-200"
            style={{
              color: "var(--neu-text)",
              border: "1px solid var(--neu-dark)",
            }}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 右侧：分页控件 */}
      <div className="flex items-center gap-2">
        {/* 首页按钮 */}
        <button
          onClick={handleFirst}
          disabled={currentPage === 1}
          className="px-2 py-1 text-xs rounded transition-all duration-200 neu-flat hover:neu-hover active:neu-active disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ color: "var(--neu-text)" }}
          title="首页"
        >
          ««
        </button>

        {/* 上一页按钮 */}
        <button
          onClick={handlePrevious}
          disabled={currentPage === 1}
          className="px-2 py-1 text-xs rounded transition-all duration-200 neu-flat hover:neu-hover active:neu-active disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ color: "var(--neu-text)" }}
          title="上一页"
        >
          «
        </button>

        {/* 页码按钮 */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, index) => {
            if (page === '...') {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className="px-2 py-1 text-xs"
                  style={{ color: "var(--neu-text-light)" }}
                >
                  ...
                </span>
              );
            }

            const pageNum = page as number;
            const isActive = pageNum === currentPage;

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`px-2.5 py-1 text-xs rounded transition-all duration-200 ${
                  isActive
                    ? "neu-raised font-semibold"
                    : "neu-flat hover:neu-hover active:neu-active"
                }`}
                style={{
                  color: isActive
                    ? "var(--neu-accent)"
                    : "var(--neu-text)",
                }}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        {/* 下一页按钮 */}
        <button
          onClick={handleNext}
          disabled={currentPage === totalPages}
          className="px-2 py-1 text-xs rounded transition-all duration-200 neu-flat hover:neu-hover active:neu-active disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ color: "var(--neu-text)" }}
          title="下一页"
        >
          »
        </button>

        {/* 末页按钮 */}
        <button
          onClick={handleLast}
          disabled={currentPage === totalPages}
          className="px-2 py-1 text-xs rounded transition-all duration-200 neu-flat hover:neu-hover active:neu-active disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ color: "var(--neu-text)" }}
          title="末页"
        >
          »»
        </button>
      </div>
    </div>
  );
}

