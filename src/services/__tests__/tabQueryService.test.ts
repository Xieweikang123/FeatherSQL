import { describe, it, expect, beforeEach, vi } from "vitest";
import { runTabQuery } from "../tabQueryService";
import { useConnectionStore } from "../../store/connectionStore";

vi.mock("../../lib/commands", () => ({
  executeSql: vi.fn(),
}));

import { executeSql } from "../../lib/commands";

describe("tabQueryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const tab = {
      id: "tab-1",
      name: "新查询",
      connectionId: "conn-1",
      database: "mydb",
      sql: "",
      queryResult: null,
      error: null,
      isQuerying: false,
      selectedTable: null,
      columnFilters: { col: "x" },
      sortConfig: [],
      sqlToLoad: null,
      actualExecutedSql: "OLD",
      originalSqlForFilter: "OLD",
      isFilterResult: true,
    };
    useConnectionStore.setState({
      connections: [
        {
          id: "conn-1",
          name: "Test",
          type: "mysql",
          config: { host: "localhost" },
        },
      ],
      tabs: [tab],
      currentTabId: "tab-1",
      editMode: false,
    });
  });

  it("full mode resets filter metadata and updates result", async () => {
    vi.mocked(executeSql).mockResolvedValue({
      columns: ["id"],
      rows: [[1]],
    });

    await runTabQuery({ sql: "SELECT 1", mode: "full", saveWorkspace: false });

    const tab = useConnectionStore.getState().getCurrentTab();
    expect(tab?.queryResult?.columns).toEqual(["id"]);
    expect(tab?.columnFilters).toEqual({});
    expect(tab?.actualExecutedSql).toBe("SELECT 1");
    expect(tab?.originalSqlForFilter).toBe("SELECT 1");
    expect(tab?.isFilterResult).toBe(false);
    expect(tab?.isQuerying).toBe(false);
  });

  it("should preserve query result when execution fails", async () => {
    const previousResult = {
      columns: ["id"],
      rows: [[99]],
    };
    useConnectionStore.setState({
      tabs: [
        {
          ...useConnectionStore.getState().tabs[0],
          queryResult: previousResult,
        },
      ],
    });

    vi.mocked(executeSql).mockRejectedValue(new Error("syntax error"));

    await runTabQuery({ sql: "SELECT bad", mode: "full", saveWorkspace: false });

    const tab = useConnectionStore.getState().getCurrentTab();
    expect(tab?.error).toContain("syntax error");
    expect(tab?.queryResult).toEqual(previousResult);
    expect(tab?.isQuerying).toBe(false);
  });

  it("filter mode preserves filters and marks filter result", async () => {
    vi.mocked(executeSql).mockResolvedValue({
      columns: ["id"],
      rows: [[1]],
    });

    await runTabQuery({ sql: "SELECT 1 WHERE id=1", mode: "filter" });

    const tab = useConnectionStore.getState().getCurrentTab();
    expect(tab?.columnFilters).toEqual({ col: "x" });
    expect(tab?.isFilterResult).toBe(true);
    expect(tab?.sqlToLoad).toBe("SELECT 1 WHERE id=1");
    expect(tab?.isQuerying).toBe(false);
  });
});
