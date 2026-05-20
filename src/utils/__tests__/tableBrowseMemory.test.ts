import { describe, it, expect, beforeEach } from "vitest";
import {
  hasBrowsePreferences,
  loadTableBrowseMemory,
  saveTableBrowseMemory,
} from "../tableBrowseMemory";

describe("tableBrowseMemory", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves and loads sort and filters per table", () => {
    saveTableBrowseMemory("conn-1", "mydb", "users", {
      sortConfig: [{ column: "name", direction: "asc" }],
      columnFilters: { status: "active" },
      columnFilterModes: { status: "exact" },
      pageSize: 20,
    });

    const memory = loadTableBrowseMemory("conn-1", "mydb", "users");
    expect(memory?.sortConfig).toEqual([{ column: "name", direction: "asc" }]);
    expect(memory?.columnFilters).toEqual({ status: "active" });
    expect(memory?.columnFilterModes).toEqual({ status: "exact" });
    expect(memory?.pageSize).toBe(20);
  });

  it("keeps memory isolated by connection, database, and table", () => {
    saveTableBrowseMemory("conn-1", "mydb", "users", {
      sortConfig: [{ column: "id", direction: "desc" }],
      columnFilters: {},
    });
    saveTableBrowseMemory("conn-1", "mydb", "orders", {
      sortConfig: [{ column: "created_at", direction: "asc" }],
      columnFilters: {},
    });

    expect(loadTableBrowseMemory("conn-1", "mydb", "users")?.sortConfig[0]?.column).toBe(
      "id"
    );
    expect(loadTableBrowseMemory("conn-1", "mydb", "orders")?.sortConfig[0]?.column).toBe(
      "created_at"
    );
    expect(loadTableBrowseMemory("conn-2", "mydb", "users")).toBeNull();
  });

  it("detects when saved preferences should be restored", () => {
    expect(
      hasBrowsePreferences({
        sortConfig: [{ column: "id", direction: "asc" }],
        columnFilters: {},
      })
    ).toBe(true);

    expect(
      hasBrowsePreferences({
        sortConfig: [],
        columnFilters: { name: "alice" },
      })
    ).toBe(true);

    expect(
      hasBrowsePreferences({
        sortConfig: [],
        columnFilters: {},
        pageSize: 20,
      })
    ).toBe(true);

    expect(
      hasBrowsePreferences({
        sortConfig: [],
        columnFilters: {},
        pageSize: 50,
      })
    ).toBe(false);
  });
});
