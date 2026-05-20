import type { CellModification } from "../hooks/useEditHistory";

/**
 * Build the row to render from query result data, overlaying unsaved cell edits.
 * Always use the current result row as the base so stale editedData cannot
 * show wrong values after filter/sort/refresh updates result before useEffect syncs.
 */
export function applyRowModifications(
  row: unknown[],
  rowIndex: number,
  modifications: Map<string, CellModification>
): unknown[] {
  if (modifications.size === 0) {
    return row;
  }

  let changed = false;
  const displayRow = row.map((cell, cellIndex) => {
    const mod = modifications.get(`${rowIndex}-${cellIndex}`);
    if (mod) {
      changed = true;
      return mod.newValue;
    }
    return cell;
  });

  return changed ? displayRow : row;
}
