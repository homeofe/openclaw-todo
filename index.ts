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

const DEFAULT_TODO_TEMPLATE = `# TODO

- [ ] My first task
`;

function ensureTodoFile(filePath: string): void {
  if (fs.existsSync(filePath)) return;
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, DEFAULT_TODO_TEMPLATE, "utf-8");
}

function readTodoFile(filePath: string): string {
  ensureTodoFile(filePath);
  return fs.readFileSync(filePath, "utf-8");
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
  // Add under a preferred section header if found, else append at end.
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

  ensureTodoFile(todoFile);
  api.logger?.info?.(`[todo] enabled. file=${todoFile}`);

  api.registerCommand({
    name: "todo-list",
    description: "List open TODO items",
    requireAuth: false,
    acceptsArgs: false,
    handler: async () => {
      const md = readTodoFile(todoFile);
      const todos = parseTodos(md).filter((t) => !t.done);
      const top = todos.slice(0, maxListItems);
      if (top.length === 0) return { text: "No open TODOs." };
      const lines = top.map((t, idx) => `${idx + 1}. ${t.text}`);
      return { text: `Open TODOs (${todos.length}):\n` + lines.join("\n") };
    },
  });

  api.registerCommand({
    name: "todo-add",
    description: "Add a TODO item",
    requireAuth: false,
    acceptsArgs: true,
    handler: async (ctx: any) => {
      const text = String(ctx?.args ?? "").trim();
      if (!text) return { text: "Usage: /todo-add <text>" };

      const md = readTodoFile(todoFile);
      const next = addTodo(md, text);
      fs.writeFileSync(todoFile, next, "utf-8");

      if (doBrainLog) await brainLog(brainStorePath, `added - ${text}`);
      return { text: `Added TODO: ${text}` };
    },
  });

  api.registerCommand({
    name: "todo-done",
    description: "Mark a TODO item done",
    requireAuth: false,
    acceptsArgs: true,
    handler: async (ctx: any) => {
      const idxStr = String(ctx?.args ?? "").trim();
      const idx = Number(idxStr);
      if (!idxStr || !Number.isFinite(idx) || idx < 1) {
        return { text: "Usage: /todo-done <index> (see /todo-list)" };
      }

      const md = readTodoFile(todoFile);
      const open = parseTodos(md).filter((t) => !t.done);
      const item = open[idx - 1];
      if (!item) return { text: `No open TODO at index ${idx}.` };

      const next = markDone(md, item);
      fs.writeFileSync(todoFile, next, "utf-8");

      if (doBrainLog) await brainLog(brainStorePath, `done - ${item.text}`);
      return { text: `Done: ${item.text}` };
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
      const md = readTodoFile(todoFile);
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
