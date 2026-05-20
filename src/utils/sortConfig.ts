export interface SortConfigItem {
  column: string;
  direction: 'asc' | 'desc';
}

export type SortAction = 'asc' | 'desc' | 'clear';

/**
 * 根据用户选择的排序动作计算新的 sortConfig。
 * shiftKey 为 true 时保留其他列的多列排序；否则仅保留当前列。
 */
export function applySortAction(
  sortConfig: SortConfigItem[],
  column: string,
  action: SortAction,
  shiftKey: boolean
): SortConfigItem[] {
  const existingIndex = sortConfig.findIndex((s) => s.column === column);

  if (action === 'clear') {
    return sortConfig.filter((s) => s.column !== column);
  }

  const direction = action;

  if (shiftKey) {
    if (existingIndex !== -1) {
      const newConfig = [...sortConfig];
      newConfig[existingIndex] = { column, direction };
      return newConfig;
    }
    return [...sortConfig, { column, direction }];
  }

  return [{ column, direction }];
}
