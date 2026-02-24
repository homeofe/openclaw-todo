import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { HashEmbedder, JsonlMemoryStore, uuid, type MemoryItem } from "@elvatis_com/openclaw-memory-core";

function expandHome(p: string): string {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

type TodoItem = {
  lineNo: number;
  raw: string;
  done: boolean;
  text: string;
};

function parseTodos(md: string): TodoItem[] {
  const lines = md.split("\n");
  const out: TodoItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const m = ln.match(/^\s*-\s*\[( |x)\]\s*(.+)$/i);
    if (!m) continue;
    const done = m[1].toLowerCase() === "x";
    const text = m[2].trim();
    out.push({ lineNo: i, raw: ln, done, text });
  }
  return out;
}

function markDone(md: string, item: TodoItem): string {
  const lines = md.split("\n");
  const ln = lines[item.lineNo];
  lines[item.lineNo] = ln.replace(/^\s*-\s*\[ \]/, "- [x]");
  return lines.join("\n");
}

function addTodo(md: string, text: string): string {
  // Add under first section header after PRIVATE_PROJECT if found, else append at end.
  const lines = md.split("\n");
  const bullet = `- [ ] ${text}`;

  // Prefer adding under "Weitere Projektideen" if exists
  let insertAt = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes("weitere projektideen")) {
      insertAt = i + 1;
      break;
    }
  }

  if (insertAt === -1) {
    lines.push(bullet);
    return lines.join("\n");
  }

  // Insert after header and potential blank line
  while (insertAt < lines.length && lines[insertAt].trim() === "") insertAt++;
  lines.splice(insertAt, 0, bullet);
  return lines.join("\n");
}

async function brainLog(storePath: string, text: string): Promise<void> {
  const embedder = new HashEmbedder(256);
  const store = new JsonlMemoryStore({ filePath: storePath, embedder });
  const item: MemoryItem = {
    id: uuid(),
    kind: "note",
    text: `TODO: ${text}`,
    createdAt: new Date().toISOString(),
    tags: ["todo"],
  };
  await store.add(item);
}

export default function register(api: any) {
  const cfg = (api.pluginConfig ?? {}) as {
    enabled?: boolean;
    todoFile?: string;
    brainLog?: boolean;
    brainStorePath?: string;
    maxListItems?: number;
  };

  if (cfg.enabled === false) return;

  const todoFile = expandHome(cfg.todoFile ?? "~/.openclaw/workspace/TODO.md");
  const doBrainLog = cfg.brainLog !== false;
  const brainStorePath = expandHome(cfg.brainStorePath ?? "~/.openclaw/workspace/memory/brain-memory.jsonl");
  const maxListItems = cfg.maxListItems ?? 30;

  api.logger?.info?.(`[todo] enabled. file=${todoFile}`);

  api.registerCommand({
    name: "todo-list",
    description: "List open TODO items",
    usage: "/todo-list",
    run: async () => {
      const md = fs.readFileSync(todoFile, "utf-8");
      const todos = parseTodos(md).filter((t) => !t.done);
      const top = todos.slice(0, maxListItems);
      if (top.length === 0) return { ok: true, message: "No open TODOs." };
      const lines = top.map((t, idx) => `${idx + 1}. ${t.text}`);
      return { ok: true, message: `Open TODOs (${todos.length}):\n` + lines.join("\n") };
    },
  });

  api.registerCommand({
    name: "todo-add",
    description: "Add a TODO item",
    usage: "/todo-add <text>",
    run: async (ctx: any) => {
      const text = (ctx?.argsText ?? "").trim();
      if (!text) return { ok: true, message: "Usage: /todo-add <text>" };

      const md = fs.readFileSync(todoFile, "utf-8");
      const next = addTodo(md, text);
      fs.writeFileSync(todoFile, next, "utf-8");

      if (doBrainLog) await brainLog(brainStorePath, `added - ${text}`);
      return { ok: true, message: `Added TODO: ${text}` };
    },
  });

  api.registerCommand({
    name: "todo-done",
    description: "Mark a TODO item done",
    usage: "/todo-done <index>",
    run: async (ctx: any) => {
      const idxStr = (ctx?.argsText ?? "").trim();
      const idx = Number(idxStr);
      if (!idxStr || !Number.isFinite(idx) || idx < 1) {
        return { ok: true, message: "Usage: /todo-done <index> (see /todo-list)" };
      }

      const md = fs.readFileSync(todoFile, "utf-8");
      const open = parseTodos(md).filter((t) => !t.done);
      const item = open[idx - 1];
      if (!item) return { ok: true, message: `No open TODO at index ${idx}.` };

      const next = markDone(md, item);
      fs.writeFileSync(todoFile, next, "utf-8");

      if (doBrainLog) await brainLog(brainStorePath, `done - ${item.text}`);
      return { ok: true, message: `Done: ${item.text}` };
    },
  });

  // Tool: todo_status
  api.registerTool({
    name: "todo_status",
    description: "Return structured TODO status from TODO.md",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: { type: "number", minimum: 1, maximum: 200, default: 50 },
      },
    },
    handler: async (params: any) => {
      const limit = Number(params?.limit ?? 50);
      const md = fs.readFileSync(todoFile, "utf-8");
      const all = parseTodos(md);
      const open = all.filter((t) => !t.done);
      const done = all.filter((t) => t.done);
      return {
        todoFile,
        openCount: open.length,
        doneCount: done.length,
        open: open.slice(0, limit).map((t) => t.text),
      };
    },
  });
}
