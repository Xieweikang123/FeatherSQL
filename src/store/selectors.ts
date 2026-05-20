import type { ConnectionState } from "./connectionStore";

export const selectCurrentTab = (state: ConnectionState) => {
  if (!state.currentTabId) {
    return null;
  }
  return state.tabs.find((tab) => tab.id === state.currentTabId) ?? null;
};

export const selectCurrentConnectionId = (state: ConnectionState) =>
  selectCurrentTab(state)?.connectionId ?? null;

export const selectCurrentDatabase = (state: ConnectionState) =>
  selectCurrentTab(state)?.database ?? null;

export const selectEditMode = (state: ConnectionState) =>
  selectCurrentTab(state)?.editMode ?? false;

/** 是否应在主区域显示数据表列表（已选连接且已选数据库 / SQLite 已连接） */
export const selectShouldShowTableView = (state: ConnectionState) => {
  const tab = selectCurrentTab(state);
  const connectionId = tab?.connectionId ?? null;
  const database = tab?.database ?? null;
  if (!connectionId || database === null) {
    return false;
  }
  const connection = state.connections.find((c) => c.id === connectionId);
  if (!connection) {
    return false;
  }
  if (connection.type === "sqlite") {
    return database === "";
  }
  return database !== "";
};

/** 是否应在主区域显示表列表（已选库且处于浏览表模式，未选具体表） */
export const selectShouldShowTableBrowser = (state: ConnectionState) => {
  const tab = selectCurrentTab(state);
  if (!tab || tab.selectedTable) {
    return false;
  }
  if (!selectShouldShowTableView(state)) {
    return false;
  }
  return tab.showTableBrowser === true;
};

/** 是否应在主区域显示 SQL 编辑器（查看数据表/表数据时不显示） */
export const selectShouldShowSqlEditor = (state: ConnectionState) => {
  const tab = selectCurrentTab(state);
  if (!tab) {
    return true;
  }
  if (tab.selectedTable) {
    return false;
  }
  if (selectShouldShowTableBrowser(state)) {
    return false;
  }
  return true;
};
