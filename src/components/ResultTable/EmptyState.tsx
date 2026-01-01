interface EmptyStateProps {
  hasActiveFilters: boolean;
  columnCount: number;
}

export default function EmptyState({ hasActiveFilters, columnCount }: EmptyStateProps) {
  return (
    <tr>
      <td
        colSpan={columnCount + 1}
        className="px-4 py-12 text-center"
        style={{ color: 'var(--neu-text-light)' }}
      >
        <div className="flex flex-col items-center gap-2">
          <span className="text-3xl opacity-50">📭</span>
          <span className="font-medium">
            {hasActiveFilters ? "无匹配的数据" : "无数据"}
          </span>
        </div>
      </td>
    </tr>
  );
}

