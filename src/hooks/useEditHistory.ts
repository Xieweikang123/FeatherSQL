import { useState, useRef, useCallback } from "react";
import type { QueryResult } from "../lib/commands";

export interface CellModification {
  rowIndex: number;
  column: string;
  oldValue: any;
  newValue: any;
}

export interface EditHistoryState {
  editedData: QueryResult;
  modifications: Map<string, CellModification>;
}

const MAX_HISTORY_SIZE = 50;

function deepCopyQueryResult(data: QueryResult): QueryResult {
  return {
    columns: [...data.columns],
    rows: data.rows.map((row) => [...row]),
  };
}

function copyState(state: EditHistoryState): EditHistoryState {
  return {
    editedData: deepCopyQueryResult(state.editedData),
    modifications: new Map(state.modifications),
  };
}

/**
 * 管理表格编辑的 undo/redo（双栈）
 */
export function useEditHistory() {
  const undoStackRef = useRef<EditHistoryState[]>([]);
  const redoStackRef = useRef<EditHistoryState[]>([]);
  const [revision, setRevision] = useState(0);

  const bump = useCallback(() => setRevision((n) => n + 1), []);

  const saveToHistory = useCallback(
    (editedData: QueryResult, modifications: Map<string, CellModification>) => {
      undoStackRef.current = [
        ...undoStackRef.current,
        copyState({ editedData, modifications }),
      ].slice(-MAX_HISTORY_SIZE);
      redoStackRef.current = [];
      bump();
    },
    [bump]
  );

  const undo = useCallback(
    (current: EditHistoryState): EditHistoryState | null => {
      if (undoStackRef.current.length === 0) {
        return null;
      }
      redoStackRef.current = [...redoStackRef.current, copyState(current)];
      const previous = undoStackRef.current[undoStackRef.current.length - 1];
      undoStackRef.current = undoStackRef.current.slice(0, -1);
      bump();
      return copyState(previous);
    },
    [bump]
  );

  const redo = useCallback(
    (current: EditHistoryState): EditHistoryState | null => {
      if (redoStackRef.current.length === 0) {
        return null;
      }
      undoStackRef.current = [...undoStackRef.current, copyState(current)];
      const next = redoStackRef.current[redoStackRef.current.length - 1];
      redoStackRef.current = redoStackRef.current.slice(0, -1);
      bump();
      return copyState(next);
    },
    [bump]
  );

  const reset = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    bump();
  }, [bump]);

  void revision;

  return {
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    saveToHistory,
    undo,
    redo,
    reset,
  };
}
