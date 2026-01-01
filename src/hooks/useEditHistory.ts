import { useState, useRef, useEffect, useCallback } from "react";
import type { QueryResult } from "../lib/commands";

export interface CellModification {
  rowIndex: number;
  column: string;
  oldValue: any;
  newValue: any;
}

interface EditHistoryState {
  editedData: QueryResult;
  modifications: Map<string, CellModification>;
}

const MAX_HISTORY_SIZE = 50;

/**
 * 高效的深拷贝函数，专门用于 QueryResult 结构
 * 比 JSON.parse(JSON.stringify()) 更快，特别是对于大数据集
 */
function deepCopyQueryResult(data: QueryResult): QueryResult {
  return {
    columns: [...data.columns],
    rows: data.rows.map(row => [...row]),
  };
}

/**
 * Hook to manage edit history (undo/redo) for table editing
 */
export function useEditHistory(initialData: QueryResult) {
  const [history, setHistory] = useState<EditHistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyIndexRef = useRef(-1);

  // Sync historyIndexRef with historyIndex
  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  const saveToHistory = (editedData: QueryResult, modifications: Map<string, CellModification>) => {
    const currentState: EditHistoryState = {
      editedData: deepCopyQueryResult(editedData), // 使用优化的深拷贝
      modifications: new Map(modifications),
    };

    const currentIndex = historyIndexRef.current;

    setHistory((prevHistory) => {
      const newHistory = prevHistory.slice(0, currentIndex + 1);
      newHistory.push(currentState);
      if (newHistory.length > MAX_HISTORY_SIZE) {
        return newHistory.slice(-MAX_HISTORY_SIZE);
      }
      return newHistory;
    });

    const newIndex = currentIndex + 1;
    const finalIndex = newIndex >= MAX_HISTORY_SIZE ? MAX_HISTORY_SIZE - 1 : newIndex;
    setHistoryIndex(finalIndex);
    historyIndexRef.current = finalIndex;
  };

  const undo = (): EditHistoryState | null => {
    const currentIndex = historyIndexRef.current;
    if (currentIndex < 0) {
      return null;
    }

    const previousState = history[currentIndex];
    if (previousState) {
      const newIndex = currentIndex - 1;
      setHistoryIndex(newIndex);
      historyIndexRef.current = newIndex;
      return previousState;
    }
    return null;
  };

  const redo = (): EditHistoryState | null => {
    const currentIndex = historyIndexRef.current;
    if (currentIndex >= history.length - 1) {
      return null;
    }

    const nextState = history[currentIndex + 1];
    if (nextState) {
      const newIndex = currentIndex + 1;
      setHistoryIndex(newIndex);
      historyIndexRef.current = newIndex;
      return nextState;
    }
    return null;
  };

  const reset = useCallback(() => {
    setHistory([]);
    setHistoryIndex(-1);
    historyIndexRef.current = -1;
  }, []);

  return {
    history,
    historyIndex,
    canUndo: historyIndex >= 0,
    canRedo: historyIndex < history.length - 1,
    saveToHistory,
    undo,
    redo,
    reset,
  };
}

