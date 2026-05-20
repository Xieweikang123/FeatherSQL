import { describe, it, expect } from "vitest";
import { applyRowModifications } from "../resultRowDisplay";
import type { CellModification } from "../../hooks/useEditHistory";

describe("applyRowModifications", () => {
  it("returns the same row reference when there are no modifications", () => {
    const row = ["a", "b"];
    expect(applyRowModifications(row, 0, new Map())).toBe(row);
  });

  it("overlays modified cell values onto the current result row", () => {
    const row = ["original-a", "original-b"];
    const mods = new Map<string, CellModification>([
      ["0-1", { rowIndex: 0, column: "name", oldValue: "original-b", newValue: "edited-b" }],
    ]);

    expect(applyRowModifications(row, 0, mods)).toEqual(["original-a", "edited-b"]);
  });

  it("uses the current result row instead of stale editedData at the same index", () => {
    const newResultRow = ["new-a", "new-b"];
    const staleEditedRow = ["stale-a", "stale-b"];
    const mods = new Map<string, CellModification>();

    const displayRow = applyRowModifications(newResultRow, 0, mods);
    expect(displayRow).toEqual(newResultRow);
    expect(displayRow).not.toEqual(staleEditedRow);
  });

  it("applies modifications for the requested row index only", () => {
    const row = ["x", "y"];
    const mods = new Map<string, CellModification>([
      ["1-0", { rowIndex: 1, column: "id", oldValue: "other", newValue: "wrong-row" }],
      ["0-1", { rowIndex: 0, column: "name", oldValue: "y", newValue: "edited-y" }],
    ]);

    expect(applyRowModifications(row, 0, mods)).toEqual(["x", "edited-y"]);
  });
});
