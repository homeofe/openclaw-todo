import { describe, it, expect } from "vitest";
import { expandHome, parseTodos, markDone, editTodo, removeTodo, addTodo, type TodoItem } from "./index.js";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// expandHome
// ---------------------------------------------------------------------------
describe("expandHome", () => {
  it("returns empty string for empty input", () => {
    expect(expandHome("")).toBe("");
  });

  it("expands bare ~ to home directory", () => {
    expect(expandHome("~")).toBe(os.homedir());
  });

  it("expands ~/path to home + path", () => {
    const result = expandHome("~/foo/bar");
    expect(result).toBe(path.join(os.homedir(), "foo/bar"));
  });

  it("leaves absolute paths unchanged", () => {
    expect(expandHome("/usr/local/bin")).toBe("/usr/local/bin");
  });

  it("leaves relative paths unchanged", () => {
    expect(expandHome("relative/path")).toBe("relative/path");
  });
});

// ---------------------------------------------------------------------------
// parseTodos
// ---------------------------------------------------------------------------
describe("parseTodos", () => {
  it("returns empty array for empty string", () => {
    expect(parseTodos("")).toEqual([]);
  });

  it("returns empty array for markdown without todos", () => {
    const md = "# Notes\n\nSome text here.\n";
    expect(parseTodos(md)).toEqual([]);
  });

  it("parses a single open todo", () => {
    const md = "- [ ] Buy milk";
    const result = parseTodos(md);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      lineNo: 0,
      raw: "- [ ] Buy milk",
      done: false,
      text: "Buy milk",
    });
  });

  it("parses a single done todo", () => {
    const md = "- [x] Buy milk";
    const result = parseTodos(md);
    expect(result).toHaveLength(1);
    expect(result[0].done).toBe(true);
    expect(result[0].text).toBe("Buy milk");
  });

  it("handles uppercase X as done", () => {
    const md = "- [X] Done task";
    const result = parseTodos(md);
    expect(result).toHaveLength(1);
    expect(result[0].done).toBe(true);
  });

  it("parses mixed open and done todos", () => {
    const md = [
      "# TODO",
      "",
      "- [ ] Open task",
      "- [x] Done task",
      "- [ ] Another open",
    ].join("\n");
    const result = parseTodos(md);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ done: false, text: "Open task", lineNo: 2 });
    expect(result[1]).toMatchObject({ done: true, text: "Done task", lineNo: 3 });
    expect(result[2]).toMatchObject({ done: false, text: "Another open", lineNo: 4 });
  });

  it("handles indented todos", () => {
    const md = "  - [ ] Indented task";
    const result = parseTodos(md);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Indented task");
  });

  it("ignores lines that look similar but are not todos", () => {
    const md = [
      "- Regular list item",
      "- [] Missing space",
      "- [a] Wrong character",
      "Some - [ ] inline text",
    ].join("\n");
    // Only "Some - [ ] inline text" would NOT match because it doesn't start with - [ ]
    // "- [] Missing space" won't match, "- [a] Wrong character" won't match
    const result = parseTodos(md);
    expect(result).toHaveLength(0);
  });

  it("preserves correct line numbers with blank lines", () => {
    const md = [
      "# Header",   // 0
      "",            // 1
      "- [ ] First", // 2
      "",            // 3
      "- [x] Second", // 4
    ].join("\n");
    const result = parseTodos(md);
    expect(result[0].lineNo).toBe(2);
    expect(result[1].lineNo).toBe(4);
  });

  it("trims whitespace from todo text", () => {
    const md = "- [ ]   Lots of spaces   ";
    const result = parseTodos(md);
    expect(result[0].text).toBe("Lots of spaces");
  });
});

// ---------------------------------------------------------------------------
// markDone
// ---------------------------------------------------------------------------
describe("markDone", () => {
  it("marks an open item as done", () => {
    const md = "- [ ] Buy milk";
    const item: TodoItem = { lineNo: 0, raw: "- [ ] Buy milk", done: false, text: "Buy milk" };
    const result = markDone(md, item);
    expect(result).toBe("- [x] Buy milk");
  });

  it("marks the correct item in a multi-line document", () => {
    const md = [
      "# TODO",
      "- [ ] First",
      "- [ ] Second",
      "- [ ] Third",
    ].join("\n");
    const item: TodoItem = { lineNo: 2, raw: "- [ ] Second", done: false, text: "Second" };
    const result = markDone(md, item);
    const lines = result.split("\n");
    expect(lines[1]).toBe("- [ ] First");
    expect(lines[2]).toBe("- [x] Second");
    expect(lines[3]).toBe("- [ ] Third");
  });

  it("does not affect already-done items on other lines", () => {
    const md = [
      "- [x] Already done",
      "- [ ] To mark",
    ].join("\n");
    const item: TodoItem = { lineNo: 1, raw: "- [ ] To mark", done: false, text: "To mark" };
    const result = markDone(md, item);
    const lines = result.split("\n");
    expect(lines[0]).toBe("- [x] Already done");
    expect(lines[1]).toBe("- [x] To mark");
  });

  it("handles indented items", () => {
    const md = "  - [ ] Indented";
    const item: TodoItem = { lineNo: 0, raw: "  - [ ] Indented", done: false, text: "Indented" };
    const result = markDone(md, item);
    expect(result).toBe("- [x] Indented");
  });
});

// ---------------------------------------------------------------------------
// editTodo
// ---------------------------------------------------------------------------
describe("editTodo", () => {
  it("replaces the text of an open item", () => {
    const md = "- [ ] Buy milk";
    const item: TodoItem = { lineNo: 0, raw: "- [ ] Buy milk", done: false, text: "Buy milk" };
    const result = editTodo(md, item, "Buy oat milk");
    expect(result).toBe("- [ ] Buy oat milk");
  });

  it("replaces the text of a done item", () => {
    const md = "- [x] Buy milk";
    const item: TodoItem = { lineNo: 0, raw: "- [x] Buy milk", done: true, text: "Buy milk" };
    const result = editTodo(md, item, "Buy oat milk");
    expect(result).toBe("- [x] Buy oat milk");
  });

  it("edits the correct item in a multi-line document", () => {
    const md = [
      "# TODO",
      "- [ ] First",
      "- [ ] Second",
      "- [ ] Third",
    ].join("\n");
    const item: TodoItem = { lineNo: 2, raw: "- [ ] Second", done: false, text: "Second" };
    const result = editTodo(md, item, "Updated second");
    const lines = result.split("\n");
    expect(lines[1]).toBe("- [ ] First");
    expect(lines[2]).toBe("- [ ] Updated second");
    expect(lines[3]).toBe("- [ ] Third");
  });

  it("preserves done state when editing", () => {
    const md = [
      "- [x] Done task",
      "- [ ] Open task",
    ].join("\n");
    const item: TodoItem = { lineNo: 0, raw: "- [x] Done task", done: true, text: "Done task" };
    const result = editTodo(md, item, "Edited done task");
    const lines = result.split("\n");
    expect(lines[0]).toBe("- [x] Edited done task");
    expect(lines[1]).toBe("- [ ] Open task");
  });

  it("handles indented items", () => {
    const md = "  - [ ] Indented task";
    const item: TodoItem = { lineNo: 0, raw: "  - [ ] Indented task", done: false, text: "Indented task" };
    const result = editTodo(md, item, "New text");
    expect(result).toBe("  - [ ] New text");
  });
});

// ---------------------------------------------------------------------------
// editTodo + parseTodos round-trip
// ---------------------------------------------------------------------------
describe("editTodo + parseTodos round-trip", () => {
  it("edits an item and re-parses correctly", () => {
    const md = [
      "# TODO",
      "- [ ] Task A",
      "- [ ] Task B",
      "- [ ] Task C",
    ].join("\n");

    const todos = parseTodos(md);
    const updated = editTodo(md, todos[1], "Task B edited");
    const reParsed = parseTodos(updated);

    expect(reParsed).toHaveLength(3);
    expect(reParsed[0].text).toBe("Task A");
    expect(reParsed[1].text).toBe("Task B edited");
    expect(reParsed[2].text).toBe("Task C");
    expect(reParsed.every((t) => !t.done)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// removeTodo
// ---------------------------------------------------------------------------
describe("removeTodo", () => {
  it("removes a single item from a one-item document", () => {
    const md = "- [ ] Only task";
    const item: TodoItem = { lineNo: 0, raw: "- [ ] Only task", done: false, text: "Only task" };
    const result = removeTodo(md, item);
    expect(result).toBe("");
  });

  it("removes the correct item from a multi-line document", () => {
    const md = [
      "# TODO",
      "- [ ] First",
      "- [ ] Second",
      "- [ ] Third",
    ].join("\n");
    const item: TodoItem = { lineNo: 2, raw: "- [ ] Second", done: false, text: "Second" };
    const result = removeTodo(md, item);
    const lines = result.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("# TODO");
    expect(lines[1]).toBe("- [ ] First");
    expect(lines[2]).toBe("- [ ] Third");
  });

  it("removes the first item", () => {
    const md = [
      "- [ ] First",
      "- [ ] Second",
    ].join("\n");
    const item: TodoItem = { lineNo: 0, raw: "- [ ] First", done: false, text: "First" };
    const result = removeTodo(md, item);
    expect(result).toBe("- [ ] Second");
  });

  it("removes the last item", () => {
    const md = [
      "- [ ] First",
      "- [ ] Second",
    ].join("\n");
    const item: TodoItem = { lineNo: 1, raw: "- [ ] Second", done: false, text: "Second" };
    const result = removeTodo(md, item);
    expect(result).toBe("- [ ] First");
  });

  it("removes a done item", () => {
    const md = [
      "- [ ] Open",
      "- [x] Done",
    ].join("\n");
    const item: TodoItem = { lineNo: 1, raw: "- [x] Done", done: true, text: "Done" };
    const result = removeTodo(md, item);
    expect(result).toBe("- [ ] Open");
  });

  it("preserves surrounding non-todo lines", () => {
    const md = [
      "# TODO",
      "",
      "- [ ] Task",
      "",
      "Some notes",
    ].join("\n");
    const item: TodoItem = { lineNo: 2, raw: "- [ ] Task", done: false, text: "Task" };
    const result = removeTodo(md, item);
    const lines = result.split("\n");
    expect(lines).toEqual(["# TODO", "", "", "Some notes"]);
  });
});

// ---------------------------------------------------------------------------
// removeTodo + parseTodos round-trip
// ---------------------------------------------------------------------------
describe("removeTodo + parseTodos round-trip", () => {
  it("removes an item and re-parses correctly", () => {
    const md = [
      "# TODO",
      "- [ ] Task A",
      "- [ ] Task B",
      "- [ ] Task C",
    ].join("\n");

    const todos = parseTodos(md);
    const updated = removeTodo(md, todos[1]); // remove Task B
    const reParsed = parseTodos(updated);

    expect(reParsed).toHaveLength(2);
    expect(reParsed[0].text).toBe("Task A");
    expect(reParsed[1].text).toBe("Task C");
  });
});

// ---------------------------------------------------------------------------
// addTodo
// ---------------------------------------------------------------------------
describe("addTodo", () => {
  it("appends to an empty document", () => {
    const result = addTodo("", "New task");
    expect(result).toContain("- [ ] New task");
  });

  it("appends after existing todos when no section header", () => {
    const md = [
      "# TODO",
      "",
      "- [ ] Existing task",
    ].join("\n");
    const result = addTodo(md, "New task");
    const lines = result.split("\n");
    const existingIdx = lines.indexOf("- [ ] Existing task");
    const newIdx = lines.indexOf("- [ ] New task");
    expect(newIdx).toBeGreaterThan(existingIdx);
  });

  it("inserts under section header when provided", () => {
    const md = [
      "# TODO",
      "",
      "- [ ] Existing task",
      "",
      "## Done",
      "",
      "- [x] Finished",
    ].join("\n");
    const result = addTodo(md, "New task", "# TODO");
    const lines = result.split("\n");
    // Should be inserted near the top, under the header
    const headerIdx = lines.findIndex((l) => l === "# TODO");
    const newIdx = lines.indexOf("- [ ] New task");
    expect(newIdx).toBeGreaterThan(headerIdx);
  });

  it("is case-insensitive for section header matching", () => {
    const md = [
      "# TODO",
      "",
      "- [ ] Existing",
    ].join("\n");
    const result = addTodo(md, "New task", "# todo");
    expect(result).toContain("- [ ] New task");
  });

  it("falls back to last todo position when header not found", () => {
    const md = [
      "# Tasks",
      "",
      "- [ ] First",
      "- [ ] Second",
    ].join("\n");
    const result = addTodo(md, "Third", "# Nonexistent Header");
    const lines = result.split("\n");
    const secondIdx = lines.indexOf("- [ ] Second");
    const thirdIdx = lines.indexOf("- [ ] Third");
    expect(thirdIdx).toBeGreaterThan(secondIdx);
  });

  it("appends at end when no todos and no header match", () => {
    const md = "# Notes\n\nSome text.";
    const result = addTodo(md, "First task", "# Nonexistent");
    const lines = result.split("\n");
    expect(lines[lines.length - 1]).toBe("- [ ] First task");
  });

  it("skips blank lines after header before inserting", () => {
    const md = [
      "# TODO",
      "",
      "",
      "- [ ] Existing",
    ].join("\n");
    const result = addTodo(md, "New task", "# TODO");
    const lines = result.split("\n");
    const newIdx = lines.indexOf("- [ ] New task");
    // Should skip past blank lines, inserting right before existing items
    expect(newIdx).toBeGreaterThanOrEqual(2);
  });

  it("handles document with only a header", () => {
    const md = "# TODO\n";
    const result = addTodo(md, "First task", "# TODO");
    expect(result).toContain("- [ ] First task");
  });

  it("adds multiple todos sequentially", () => {
    let md = "# TODO\n";
    md = addTodo(md, "First", "# TODO");
    md = addTodo(md, "Second", "# TODO");
    md = addTodo(md, "Third", "# TODO");
    const todos = parseTodos(md).filter((t) => !t.done);
    expect(todos).toHaveLength(3);
    // All three should be present
    const texts = todos.map((t) => t.text);
    expect(texts).toContain("First");
    expect(texts).toContain("Second");
    expect(texts).toContain("Third");
  });
});

// ---------------------------------------------------------------------------
// Integration: parseTodos + markDone round-trip
// ---------------------------------------------------------------------------
describe("parseTodos + markDone round-trip", () => {
  it("marks an item done and re-parses correctly", () => {
    const md = [
      "# TODO",
      "- [ ] Task A",
      "- [ ] Task B",
      "- [ ] Task C",
    ].join("\n");

    const todos = parseTodos(md);
    expect(todos.filter((t) => !t.done)).toHaveLength(3);

    const updated = markDone(md, todos[1]); // mark Task B done
    const reParsed = parseTodos(updated);

    expect(reParsed.filter((t) => !t.done)).toHaveLength(2);
    expect(reParsed.filter((t) => t.done)).toHaveLength(1);
    expect(reParsed.find((t) => t.done)!.text).toBe("Task B");
  });
});

// ---------------------------------------------------------------------------
// Integration: addTodo + parseTodos round-trip
// ---------------------------------------------------------------------------
describe("addTodo + parseTodos round-trip", () => {
  it("adds a todo and parses it back", () => {
    const md = "# TODO\n\n- [ ] Existing\n";
    const updated = addTodo(md, "New item");
    const todos = parseTodos(updated);
    const texts = todos.map((t) => t.text);
    expect(texts).toContain("Existing");
    expect(texts).toContain("New item");
    expect(todos.every((t) => !t.done)).toBe(true);
  });
});
