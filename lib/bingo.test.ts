import { expect, test } from "bun:test";

import {
  CENTER_INDEX,
  CELL_COUNT,
  effectiveMarks,
  emptyMarks,
  findWinningPatterns,
  hasBlackout,
  hasColumn,
  hasCorners,
  hasDiagonal,
  hasRow,
  marksForCells,
  matchedPatterns,
  parseMarks,
  serializeMarks,
} from "./bingo";

function marks(indexes: number[]) {
  const next = Array.from({ length: CELL_COUNT }, () => false);
  next[CENTER_INDEX] = true;
  for (const index of indexes) next[index] = true;
  return next;
}

test("FREE center is always marked", () => {
  const cells = Array.from({ length: CELL_COUNT }, (_, i) => i + 1);
  cells[CENTER_INDEX] = 0;
  expect(marksForCells(cells, [])[CENTER_INDEX]).toBe(true);
});

test("effectiveMarks ignores premature daubs until called", () => {
  const cells = Array.from({ length: CELL_COUNT }, (_, i) => i + 1);
  cells[CENTER_INDEX] = 0;
  const marks = emptyMarks();
  marks[0] = true;
  expect(effectiveMarks(cells, marks, [])[0]).toBe(false);
  expect(effectiveMarks(cells, marks, [cells[0]!])[0]).toBe(true);
  expect(effectiveMarks(cells, marks, [])[CENTER_INDEX]).toBe(true);
});

test("parseMarks and serializeMarks round-trip", () => {
  const marked = marks([0, 1, 2]);
  const raw = serializeMarks(marked);
  expect(parseMarks(raw)).toEqual(marked);
  expect(parseMarks("[]")[CENTER_INDEX]).toBe(true);
  expect(parseMarks("not-json")[CENTER_INDEX]).toBe(true);
});

test("row / column / diagonal / corners / blackout", () => {
  expect(hasRow(marks([0, 1, 2, 3, 4]))).toBe(true);
  expect(hasColumn(marks([0, 5, 10, 15, 20]))).toBe(true);
  expect(hasDiagonal(marks([0, 6, 18, 24]))).toBe(true);
  expect(hasCorners(marks([0, 4, 20, 24]))).toBe(true);
  expect(hasBlackout(Array.from({ length: CELL_COUNT }, () => true))).toBe(true);
  expect(hasRow(marks([0, 1, 2]))).toBe(false);
});

test("any_line accepts a row but not corners alone", () => {
  expect(matchedPatterns(marks([0, 1, 2, 3, 4]), "any_line")).toEqual(["row"]);
  expect(matchedPatterns(marks([0, 4, 20, 24]), "any_line")).toEqual([]);
  expect(matchedPatterns(marks([0, 4, 20, 24]), "corners")).toEqual(["corners"]);
});

test("findWinningPatterns lists every completed shape", () => {
  const all = Array.from({ length: CELL_COUNT }, () => true);
  expect(findWinningPatterns(all)).toEqual([
    "row",
    "column",
    "diagonal",
    "corners",
    "blackout",
  ]);
});
