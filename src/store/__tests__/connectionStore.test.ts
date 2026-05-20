import { describe, it, expect, beforeEach } from "vitest";
import {
  TABLE_BROWSER_TAB_ID,
  useConnectionStore,
} from "../connectionStore";
import type { Connection, QueryResult } from "../../lib/commands";

describe("connectionStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useConnectionStore.setState({
      connections: [],
      tabs: [
        {
          id: TABLE_BROWSER_TAB_ID,
          name: "表",
          connectionId: null,
          database: null,
          sql: "",
          queryResult: null,
          error: null,
          isQuerying: false,
          selectedTable: null,
          columnFilters: {},
          sortConfig: [] as Array<{ column: string; direction: "asc" | "desc" }>,
          sqlToLoad: null,
          actualExecutedSql: null,
          originalSqlForFilter: null,
          editMode: false,
          showTableBrowser: false,
          isTableBrowserTab: true,
        },
      ],
      currentTabId: TABLE_BROWSER_TAB_ID,
    });
    // Clear localStorage
    localStorage.clear();
  });

  describe("basic state management", () => {
    it("should set connections", () => {
      const connections: Connection[] = [
        {
          id: "1",
          name: "Test DB",
          type: "sqlite",
          config: { filepath: "/test.db" },
        },
      ];

      useConnectionStore.getState().setConnections(connections);
      expect(useConnectionStore.getState().connections).toEqual(connections);
    });

    it("should set current connection on active tab", () => {
      useConnectionStore.getState().setCurrentConnection("conn-1");
      expect(useConnectionStore.getState().getCurrentTab()?.connectionId).toBe(
        "conn-1"
      );
    });

    it("should set current database on active tab", () => {
      useConnectionStore.getState().setCurrentDatabase("mydb");
      expect(useConnectionStore.getState().getCurrentTab()?.database).toBe(
        "mydb"
      );
      expect(useConnectionStore.getState().getCurrentTab()?.selectedTable).toBeNull();
    });

    it("should keep connection context per tab when switching tabs", () => {
      useConnectionStore.getState().setCurrentConnection("conn-a");
      useConnectionStore.getState().setCurrentDatabase("db-a");

      const tabAId = useConnectionStore.getState().createTab("Tab A");
      useConnectionStore.getState().setCurrentTab(tabAId);

      const tabBId = useConnectionStore.getState().createTab("Tab B");
      useConnectionStore.getState().setCurrentConnection("conn-b");
      useConnectionStore.getState().setCurrentDatabase("db-b");

      const tabs = useConnectionStore.getState().tabs;
      const tabA = tabs.find((t) => t.id === tabAId)!;
      const tabB = tabs.find((t) => t.id === tabBId)!;
      expect(tabA.connectionId).toBe("conn-a");
      expect(tabA.database).toBe("db-a");
      expect(tabB.connectionId).toBe("conn-b");
      expect(tabB.database).toBe("db-b");

      useConnectionStore.getState().setCurrentTab(tabAId);
      expect(useConnectionStore.getState().getCurrentTab()?.connectionId).toBe(
        "conn-a"
      );
      expect(useConnectionStore.getState().getCurrentTab()?.database).toBe(
        "db-a"
      );
    });

    it("should not close the fixed table browser tab", () => {
      const before = useConnectionStore.getState().tabs.length;
      useConnectionStore.getState().closeTab(TABLE_BROWSER_TAB_ID);
      expect(useConnectionStore.getState().tabs.length).toBe(before);
      expect(
        useConnectionStore.getState().tabs.some((t) => t.id === TABLE_BROWSER_TAB_ID)
      ).toBe(true);
    });

    it("should sync browser tab when connection changes on a data tab", () => {
      const connections: Connection[] = [
        {
          id: "conn-1",
          name: "Test DB",
          type: "mysql",
          config: { host: "localhost" },
        },
      ];
      useConnectionStore.getState().setConnections(connections);
      useConnectionStore.getState().setCurrentConnection("conn-1");
      useConnectionStore.getState().setCurrentDatabase("db_a");

      const dataTabId = useConnectionStore.getState().createTab();
      useConnectionStore.getState().updateTab(dataTabId, {
        selectedTable: "users",
        showTableBrowser: false,
      });
      useConnectionStore.getState().setCurrentTab(dataTabId);

      useConnectionStore.getState().setCurrentDatabase("db_b");

      const browser = useConnectionStore
        .getState()
        .tabs.find((t) => t.id === TABLE_BROWSER_TAB_ID)!;
      expect(browser.database).toBe("db_b");
      expect(browser.showTableBrowser).toBe(true);
    });

    it("should show table browser when switching to fixed tab with database selected", () => {
      const connections: Connection[] = [
        {
          id: "conn-1",
          name: "Test DB",
          type: "mysql",
          config: { host: "localhost" },
        },
      ];
      useConnectionStore.getState().setConnections(connections);
      useConnectionStore.getState().setCurrentConnection("conn-1");
      useConnectionStore.getState().setCurrentDatabase("mydb");

      const tableTabId = useConnectionStore.getState().createTab();
      useConnectionStore.getState().updateTab(tableTabId, {
        selectedTable: "users",
        showTableBrowser: false,
      });

      useConnectionStore.getState().setCurrentTab(TABLE_BROWSER_TAB_ID);
      const browser = useConnectionStore.getState().getCurrentTab();
      expect(browser?.selectedTable).toBeNull();
      expect(browser?.showTableBrowser).toBe(true);
    });

    it("should open new query tab in SQL editor mode, not table browser", () => {
      const connections: Connection[] = [
        {
          id: "conn-1",
          name: "Test DB",
          type: "mysql",
          config: { host: "localhost" },
        },
      ];
      useConnectionStore.getState().setConnections(connections);
      useConnectionStore.getState().setCurrentConnection("conn-1");
      useConnectionStore.getState().setCurrentDatabase("mydb");

      const newTabId = useConnectionStore.getState().createTab();
      const newTab = useConnectionStore
        .getState()
        .tabs.find((t) => t.id === newTabId)!;

      expect(newTab.connectionId).toBe("conn-1");
      expect(newTab.database).toBe("mydb");
      expect(newTab.showTableBrowser).toBe(false);
    });

    it("should set selected table", () => {
      useConnectionStore.getState().setSelectedTable("users");
      expect(useConnectionStore.getState().getCurrentTab()?.selectedTable).toBe("users");
    });

    it("should set query result", () => {
      const result: QueryResult = {
        columns: ["id", "name"],
        rows: [[1, "test"]],
      };

      useConnectionStore.getState().setQueryResult(result);
      expect(useConnectionStore.getState().getCurrentTab()?.queryResult).toEqual(result);
      expect(useConnectionStore.getState().getCurrentTab()?.error).toBeNull();
    });

    it("should set error without clearing query result", () => {
      const result: QueryResult = {
        columns: ["id"],
        rows: [[1]],
      };
      useConnectionStore.getState().setQueryResult(result);
      useConnectionStore.getState().setError("Test error");
      expect(useConnectionStore.getState().getCurrentTab()?.error).toBe("Test error");
      expect(useConnectionStore.getState().getCurrentTab()?.queryResult).toEqual(result);
    });

    it("should set isQuerying", () => {
      useConnectionStore.getState().setIsQuerying(true);
      expect(useConnectionStore.getState().getCurrentTab()?.isQuerying).toBe(true);
    });

    it("should set column filters", () => {
      const filters = { name: "test", age: "25" };
      useConnectionStore.getState().setColumnFilters(filters);
      expect(useConnectionStore.getState().getCurrentTab()?.columnFilters).toEqual(filters);
    });
  });

  describe("SQL loading", () => {
    it("should load SQL", () => {
      useConnectionStore.getState().loadSql("SELECT * FROM users");
      expect(useConnectionStore.getState().getCurrentTab()?.sqlToLoad).toBe("SELECT * FROM users");
      expect(useConnectionStore.getState().getCurrentTab()?.sql).toBe("SELECT * FROM users");
    });

    it("should clear SQL to load", () => {
      useConnectionStore.getState().loadSql("SELECT * FROM users");
      useConnectionStore.getState().clearSqlToLoad();
      expect(useConnectionStore.getState().getCurrentTab()?.sqlToLoad).toBeNull();
      expect(useConnectionStore.getState().getCurrentTab()?.sql).toBe("SELECT * FROM users");
    });

    it("should set saved SQL", () => {
      useConnectionStore.getState().setSavedSql("SELECT * FROM users");
      expect(useConnectionStore.getState().getCurrentTab()?.sql).toBe("SELECT * FROM users");
    });
  });

  describe("workspace history", () => {
    it("should save workspace history", () => {
      const connection: Connection = {
        id: "conn-1",
        name: "Test DB",
        type: "sqlite",
        config: { filepath: "/test.db" },
      };

      useConnectionStore.getState().setConnections([connection]);
      useConnectionStore.getState().setCurrentConnection("conn-1");
      useConnectionStore.getState().setCurrentDatabase("mydb");
      useConnectionStore.getState().setSelectedTable("users");
      useConnectionStore.getState().setSavedSql("SELECT * FROM users");

      const historyId = useConnectionStore.getState().saveWorkspaceHistory();
      expect(historyId).toBeTruthy();

      const history = useConnectionStore.getState().getWorkspaceHistory();
      expect(history.length).toBeGreaterThan(0);
      const saved = history.find((h) => h.id === historyId);
      expect(saved).toBeTruthy();
      expect(saved?.connectionId).toBe("conn-1");
      expect(saved?.database).toBe("mydb");
      expect(saved?.table).toBe("users");
      expect(saved?.sql).toBe("SELECT * FROM users");
    });

    it("should generate history name automatically", () => {
      const connection: Connection = {
        id: "conn-1",
        name: "Test DB",
        type: "mysql",
        config: { host: "localhost" },
      };

      useConnectionStore.getState().setConnections([connection]);
      useConnectionStore.getState().setCurrentConnection("conn-1");
      useConnectionStore.getState().setCurrentDatabase("mydb");
      useConnectionStore.getState().setSelectedTable("users");
      useConnectionStore.getState().setSavedSql("SELECT * FROM users");

      const historyId = useConnectionStore.getState().saveWorkspaceHistory();
      const history = useConnectionStore.getState().getWorkspaceHistory();
      const saved = history.find((h) => h.id === historyId);

      expect(saved?.name).toBe("Test DB → mydb → users");
    });

    it("should restore workspace history", () => {
      const connection: Connection = {
        id: "conn-1",
        name: "Test DB",
        type: "sqlite",
        config: { filepath: "/test.db" },
      };

      useConnectionStore.getState().setConnections([connection]);
      useConnectionStore.getState().setCurrentConnection("conn-1");
      useConnectionStore.getState().setCurrentDatabase("mydb");
      useConnectionStore.getState().setSelectedTable("users");
      useConnectionStore.getState().setSavedSql("SELECT * FROM users");

      const historyId = useConnectionStore.getState().saveWorkspaceHistory("Test History");
      expect(historyId).toBeTruthy();

      const restored = useConnectionStore.getState().restoreWorkspaceHistory(historyId!);
      expect(restored).toBeTruthy();
      expect(restored?.connectionId).toBe("conn-1");
      expect(restored?.database).toBe("mydb");
      expect(restored?.table).toBe("users");
      expect(restored?.sql).toBe("SELECT * FROM users");
    });

    it("should delete workspace history", () => {
      const connection: Connection = {
        id: "conn-1",
        name: "Test DB",
        type: "sqlite",
        config: { filepath: "/test.db" },
      };

      useConnectionStore.getState().setConnections([connection]);
      useConnectionStore.getState().setCurrentConnection("conn-1");
      useConnectionStore.getState().setSavedSql("SELECT * FROM users");

      const historyId = useConnectionStore.getState().saveWorkspaceHistory("Test History");
      expect(historyId).toBeTruthy();

      useConnectionStore.getState().deleteWorkspaceHistory(historyId!);
      const history = useConnectionStore.getState().getWorkspaceHistory();
      expect(history.find((h) => h.id === historyId)).toBeUndefined();
    });

    it("should clear workspace history", () => {
      const connection: Connection = {
        id: "conn-1",
        name: "Test DB",
        type: "sqlite",
        config: { filepath: "/test.db" },
      };

      useConnectionStore.getState().setConnections([connection]);
      useConnectionStore.getState().setCurrentConnection("conn-1");
      useConnectionStore.getState().setSavedSql("SELECT * FROM users");

      useConnectionStore.getState().saveWorkspaceHistory("Test History");
      useConnectionStore.getState().clearWorkspaceHistory();

      const history = useConnectionStore.getState().getWorkspaceHistory();
      expect(history).toEqual([]);
    });

    it("should return null when saving history without connection", () => {
      const historyId = useConnectionStore.getState().saveWorkspaceHistory();
      expect(historyId).toBeNull();
    });

    it("should limit history to MAX_HISTORY_COUNT", () => {
      const connection: Connection = {
        id: "conn-1",
        name: "Test DB",
        type: "sqlite",
        config: { filepath: "/test.db" },
      };

      useConnectionStore.getState().setConnections([connection]);
      useConnectionStore.getState().setCurrentConnection("conn-1");
      useConnectionStore.getState().setSavedSql("SELECT * FROM users");

      // Save more than MAX_HISTORY_COUNT (20) entries
      for (let i = 0; i < 25; i++) {
        useConnectionStore.getState().saveWorkspaceHistory(`History ${i}`);
      }

      const history = useConnectionStore.getState().getWorkspaceHistory();
      expect(history.length).toBeLessThanOrEqual(20);
    });
  });

  describe("workspace state auto-save", () => {
    it("should save workspace state when loading SQL", () => {
      const connection: Connection = {
        id: "conn-1",
        name: "Test DB",
        type: "sqlite",
        config: { filepath: "/test.db" },
      };

      useConnectionStore.getState().setConnections([connection]);
      useConnectionStore.getState().setCurrentConnection("conn-1");
      useConnectionStore.getState().setCurrentDatabase("mydb");
      useConnectionStore.getState().setSelectedTable("users");

      useConnectionStore.getState().loadSql("SELECT * FROM users");

      const restored = useConnectionStore.getState().restoreWorkspaceState();
      expect(restored).toBeTruthy();
      expect(restored?.connectionId).toBe("conn-1");
      expect(restored?.database).toBe("mydb");
      expect(restored?.table).toBe("users");
      expect(restored?.sql).toBe("SELECT * FROM users");
    });

    it("should restore workspace state", () => {
      const connection: Connection = {
        id: "conn-1",
        name: "Test DB",
        type: "sqlite",
        config: { filepath: "/test.db" },
      };

      useConnectionStore.getState().setConnections([connection]);
      useConnectionStore.getState().setCurrentConnection("conn-1");
      useConnectionStore.getState().setCurrentDatabase("mydb");
      useConnectionStore.getState().setSelectedTable("users");
      useConnectionStore.getState().loadSql("SELECT * FROM users");

      const restored = useConnectionStore.getState().restoreWorkspaceState();
      expect(restored).toBeTruthy();
      expect(restored?.connectionId).toBe("conn-1");
      expect(restored?.database).toBe("mydb");
      expect(restored?.table).toBe("users");
      expect(restored?.sql).toBe("SELECT * FROM users");
    });

    it("should return null when no workspace state exists", () => {
      const restored = useConnectionStore.getState().restoreWorkspaceState();
      expect(restored).toBeNull();
    });
  });
});

