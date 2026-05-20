import { describe, it, expect, beforeEach, vi } from "vitest";
import { runPaginatedTabQuery } from "../tabQueryService";
import { useConnectionStore } from "../../store/connectionStore";

vi.mock("../../lib/commands", () => ({
  executeSql: vi.fn(),
}));

import { executeSql } from "../../lib/commands";

describe("runPaginatedTabQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      connections: [
        {
          id: "conn-1",
          name: "Test",
          type: "mysql",
          config: { host: "localhost" },
        },
      ],
      tabs: [
        {
          id: "tab-1",
          name: "users",
          connectionId: "conn-1",
          database: "mydb",
          sql: "",
          queryResult: null,
          error: null,
          isQuerying: false,
          selectedTable: "users",
          columnFilters: {},
          sortConfig: [],
          sqlToLoad: null,
          actualExecutedSql: null,
          originalSqlForFilter: null,
          totalRowCount: null,
        },
      ],
      currentTabId: "tab-1",
    });
  });

  it("runs count and paginated select in parallel", async () => {
    vi.mocked(executeSql)
      .mockResolvedValueOnce({
        columns: ["__feather_count"],
        rows: [[500]],
      })
      .mockResolvedValueOnce({
        columns: ["id"],
        rows: [[1], [2]],
      });

    await runPaginatedTabQuery({
      tabId: "tab-1",
      baseSql: "SELECT * FROM `mydb`.`users`",
      connectionId: "conn-1",
      database: "mydb",
      page: 1,
      pageSize: 50,
      mode: "full",
      saveWorkspace: false,
    });

    expect(executeSql).toHaveBeenCalledTimes(2);
    expect(executeSql).toHaveBeenNthCalledWith(
      1,
      "conn-1",
      "SELECT COUNT(*) AS __feather_count FROM `mydb`.`users`",
      "mydb"
    );
    expect(executeSql).toHaveBeenNthCalledWith(
      2,
      "conn-1",
      "SELECT * FROM `mydb`.`users` LIMIT 50",
      "mydb"
    );

    const tab = useConnectionStore.getState().getCurrentTab();
    expect(tab?.totalRowCount).toBe(500);
    expect(tab?.sql).toBe("SELECT * FROM `mydb`.`users`");
    expect(tab?.queryResult?.rows).toHaveLength(2);
    expect(tab?.isQuerying).toBe(false);
  });

  it("refresh mode applies offset for page 2", async () => {
    vi.mocked(executeSql)
      .mockResolvedValueOnce({ columns: ["c"], rows: [[100]] })
      .mockResolvedValueOnce({ columns: ["id"], rows: [[51]] });

    await runPaginatedTabQuery({
      tabId: "tab-1",
      baseSql: "SELECT * FROM `users`",
      page: 2,
      pageSize: 50,
      mode: "refresh",
      saveWorkspace: false,
    });

    expect(executeSql).toHaveBeenNthCalledWith(
      2,
      "conn-1",
      "SELECT * FROM `users` LIMIT 50 OFFSET 50",
      "mydb"
    );
  });

  it("refresh mode does not set isQuerying", async () => {
    useConnectionStore.setState({
      tabs: [
        {
          ...useConnectionStore.getState().tabs[0]!,
          queryResult: { columns: ["id"], rows: [[1]] },
          isQuerying: false,
        },
      ],
    });

    vi.mocked(executeSql)
      .mockResolvedValueOnce({ columns: ["c"], rows: [[100]] })
      .mockResolvedValueOnce({ columns: ["id"], rows: [[51]] });

    const queryPromise = runPaginatedTabQuery({
      tabId: "tab-1",
      baseSql: "SELECT * FROM `users`",
      page: 2,
      pageSize: 50,
      mode: "refresh",
      saveWorkspace: false,
    });

    expect(useConnectionStore.getState().getCurrentTab()?.isQuerying).toBe(false);
    await queryPromise;
    expect(useConnectionStore.getState().getCurrentTab()?.isQuerying).toBe(false);
  });
});
