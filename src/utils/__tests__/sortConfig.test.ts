import { describe, it, expect } from "vitest";
import { applySortAction } from "../sortConfig";

describe("applySortAction", () => {
  it("should set ascending sort for a new column", () => {
    expect(applySortAction([], "name", "asc", false)).toEqual([
      { column: "name", direction: "asc" },
    ]);
  });

  it("should set descending sort for a new column", () => {
    expect(applySortAction([], "name", "desc", false)).toEqual([
      { column: "name", direction: "desc" },
    ]);
  });

  it("should replace existing single-column sort", () => {
    expect(
      applySortAction([{ column: "id", direction: "asc" }], "name", "desc", false)
    ).toEqual([{ column: "name", direction: "desc" }]);
  });

  it("should update direction when shift-clicking an existing column", () => {
    expect(
      applySortAction(
        [
          { column: "name", direction: "asc" },
          { column: "id", direction: "desc" },
        ],
        "name",
        "desc",
        true
      )
    ).toEqual([
      { column: "name", direction: "desc" },
      { column: "id", direction: "desc" },
    ]);
  });

  it("should append column when shift-clicking a new column", () => {
    expect(
      applySortAction([{ column: "name", direction: "asc" }], "id", "desc", true)
    ).toEqual([
      { column: "name", direction: "asc" },
      { column: "id", direction: "desc" },
    ]);
  });

  it("should remove column on clear", () => {
    expect(
      applySortAction(
        [
          { column: "name", direction: "asc" },
          { column: "id", direction: "desc" },
        ],
        "name",
        "clear",
        false
      )
    ).toEqual([{ column: "id", direction: "desc" }]);
  });

  it("should return empty array when clearing the only sorted column", () => {
    expect(
      applySortAction([{ column: "name", direction: "asc" }], "name", "clear", false)
    ).toEqual([]);
  });
});
