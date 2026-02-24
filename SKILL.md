---
name: openclaw-todo
description: OpenClaw plugin providing TODO commands for a markdown TODO.md file.
---

# openclaw-todo

Adds commands to manage a local markdown TODO list (default: `~/.openclaw/workspace/TODO.md`).

## Commands

- `/todo-list` — list open TODO items
- `/todo-add <text>` — add a new TODO item
- `/todo-done <index>` — mark an open TODO item done (index from `/todo-list`)

## Install

```bash
clawhub install openclaw-todo
```

## Notes

- This plugin is safe for public repos (no secrets required).
- Customize file paths via plugin config in your local `openclaw.json`.
