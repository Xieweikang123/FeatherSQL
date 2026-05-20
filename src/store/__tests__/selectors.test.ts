import { describe, it, expect, beforeEach } from "vitest";
import {
  TABLE_BROWSER_TAB_ID,
  useConnectionStore,
  type TabState,
} from "../connectionStore";
import {
  selectShouldShowSqlEditor,
  selectShouldShowTableBrowser,
} from "../selectors";
import type { Connection } from "../../lib/commands";

function createTab(overrides: Partial<TabState> = {}): TabState {
  return {
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: "新查询",
    connectionId: null,
    database: null,
    sql: "",
    queryResult: null,
    error: null,
    isQuerying: false,
    selectedTable: null,
    columnFilters: {},
    sortConfig: [],
    sqlToLoad: null,
    actualExecutedSql: null,
    originalSqlForFilter: null,
    editMode: false,
    showTableBrowser: false,
    ...overrides,
  };
}

describe("selectors", () => {
  const mysqlConnection: Connection = {
    id: "conn-1",
    name: "Test DB",
    type: "mysql",
    config: { host: "localhost" },
  };

  beforeEach(() => {
    const browserTab = createTab({
      id: TABLE_BROWSER_TAB_ID,
      name: "表",
      isTableBrowserTab: true,
    });
    useConnectionStore.setState({
      connections: [mysqlConnection],
      tabs: [browserTab],
      currentTabId: TABLE_BROWSER_TAB_ID,
    });
  });

  describe("selectShouldShowSqlEditor / selectShouldShowTableBrowser", () => {
    it("shows SQL editor on new query tab even when connection and database are inherited", () => {
      useConnectionStore.getState().setCurrentConnection("conn-1");
      useConnectionStore.getState().setCurrentDatabase("mydb");

      const tabBId = useConnectionStore.getState().createTab();
      useConnectionStore.getState().setCurrentTab(tabBId);

      const state = useConnectionStore.getState();
      expect(state.getCurrentTab()?.connectionId).toBe("conn-1");
      expect(state.getCurrentTab()?.database).toBe("mydb");
      expect(state.getCurrentTab()?.showTableBrowser).toBe(false);
      expect(selectShouldShowSqlEditor(state)).toBe(true);
      expect(selectShouldShowTableBrowser(state)).toBe(false);
    });

    it("shows table browser after selecting a database", () => {
      useConnectionStore.getState().setCurrentConnection("conn-1");
      useConnectionStore.getState().setCurrentDatabase("mydb");

      const state = useConnectionStore.getState();
      expect(selectShouldShowTableBrowser(state)).toBe(true);
      expect(selectShouldShowSqlEditor(state)).toBe(false);
    });

    it("hides SQL editor when viewing table data", () => {
      useConnectionStore.getState().setCurrentConnection("conn-1");
      useConnectionStore.getState().setCurrentDatabase("mydb");
      useConnectionStore.getState().setSelectedTable("users");

      const state = useConnectionStore.getState();
      expect(selectShouldShowSqlEditor(state)).toBe(false);
      expect(selectShouldShowTableBrowser(state)).toBe(false);
    });

    it("returns to table browser after clearing table selection on browser tab", () => {
      useConnectionStore.getState().setCurrentConnection("conn-1");
      useConnectionStore.getState().setCurrentDatabase("mydb");
      useConnectionStore.getState().setSelectedTable("users");
      useConnectionStore.getState().setSelectedTable(null);

      const state = useConnectionStore.getState();
      expect(selectShouldShowSqlEditor(state)).toBe(false);
      expect(selectShouldShowTableBrowser(state)).toBe(true);
    });
  });
});
