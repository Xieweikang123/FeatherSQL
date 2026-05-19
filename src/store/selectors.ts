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
