# openclaw-todo

OpenClaw plugin to manage `TODO.md` via chat commands.

## Commands

- `/todo-list` - show open items
- `/todo-add <text>` - add an item
- `/todo-done <index>` - mark item done

## Tool

- `todo_status({ limit })` - structured TODO status for the agent

## Install (dev)

```bash
openclaw plugins install -l ~/.openclaw/workspace/openclaw-todo
openclaw gateway restart
```
