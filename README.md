# checkvist-mcp

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for [Checkvist](https://checkvist.com) — gives any MCP-compatible AI assistant full access to your tasks, lists, and notes.

## Compatible clients

This server uses the standard MCP stdio transport and works with **any MCP-compatible client**, including:

| Client | Notes |
|--------|-------|
| [Claude Code](https://claude.ai/code) | Anthropic's CLI — add to `~/.claude/settings.json` |
| [Claude Desktop](https://claude.ai/download) | Anthropic's desktop app — add to `claude_desktop_config.json` |
| [Cursor](https://cursor.sh) | Add to `.cursor/mcp.json` |
| [Windsurf](https://codeium.com/windsurf) | Add to MCP settings |
| [Continue](https://continue.dev) | Add to `config.json` |
| [Zed](https://zed.dev) | Add to `settings.json` |
| Any client | implementing the [MCP specification](https://spec.modelcontextprotocol.io) |

---

## What it does

Once configured, you can talk to your AI assistant naturally about your Checkvist tasks:

> *"What's open in my Work checklist?"*
> *"Create a task called 'Review Q3 report' under the Planning section, due Friday"*
> *"Search all my lists for anything related to the budget"*
> *"Show me everything overdue across all my checklists"*

---

## Tools

| Tool | Description |
|------|-------------|
| `list_checklists` | List all Checkvist lists with open/total counts and % complete |
| `get_tasks` | Full flattened view of a list: every task with its complete hierarchy path (e.g. `Project > Area > Task`) |
| `get_open_tasks` | Only the open (incomplete) tasks from a list — ideal for daily reviews |
| `get_due_tasks` | All open tasks with due dates, optionally filtered by how many days ahead |
| `search_tasks` | Keyword search across all lists or within a specific one |
| `create_task` | Create a task at the top level or nested under a parent |
| `update_task` | Change a task's content or due date |
| `complete_task` | Mark a task as done |
| `reopen_task` | Reopen a completed task |
| `delete_task` | Permanently delete a task and all its subtasks |
| `get_task_notes` | Fetch all notes/comments on a task |
| `add_task_note` | Add a note or comment to a task |
| `get_checklist_stats` | Summary stats: total, open, closed, overdue, depth breakdown |

---

## Prerequisites

- [Node.js](https://nodejs.org) v20 or later
- A [Checkvist](https://checkvist.com) account
- Any MCP-compatible client (see table above)

---

## Installation

### 1. Clone and install

```bash
git clone https://github.com/shashankmehrotra-coder/mcp-checkvist.git
cd mcp-checkvist
npm install
```

### 2. Get your Checkvist API key

1. Log in to [checkvist.com](https://checkvist.com)
2. Go to your profile: **[checkvist.com/auth/profile](https://checkvist.com/auth/profile)**
3. Copy the **Remote API key**

### 3. Create your `.env` file

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

```
CHECKVIST_USERNAME=your-email@example.com
CHECKVIST_API_KEY=your-remote-api-key
```

> **Security:** `.env` is listed in `.gitignore` and will never be committed. Never share your API key or commit it to source control.

---

## Client configuration

The server command is always:

```
node --env-file=/absolute/path/to/mcp-checkvist/.env /absolute/path/to/mcp-checkvist/index.js
```

Replace `/absolute/path/to/mcp-checkvist` with where you cloned this repo. Config snippets for each client are shown below.

### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "checkvist": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/mcp-checkvist/.env",
        "/absolute/path/to/mcp-checkvist/index.js"
      ]
    }
  }
}
```

Restart Claude Code fully after saving.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "checkvist": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/mcp-checkvist/.env",
        "/absolute/path/to/mcp-checkvist/index.js"
      ]
    }
  }
}
```

Restart Claude Desktop after saving.

### Cursor

Add to `.cursor/mcp.json` in your home directory or project root:

```json
{
  "mcpServers": {
    "checkvist": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/mcp-checkvist/.env",
        "/absolute/path/to/mcp-checkvist/index.js"
      ]
    }
  }
}
```

### Windsurf

Add to Windsurf's MCP settings (Preferences → MCP):

```json
{
  "mcpServers": {
    "checkvist": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/mcp-checkvist/.env",
        "/absolute/path/to/mcp-checkvist/index.js"
      ]
    }
  }
}
```

### Alternative: pass credentials via environment block

If your client supports an `env` block in the MCP config, you can skip the `--env-file` flag:

```json
{
  "mcpServers": {
    "checkvist": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-checkvist/index.js"],
      "env": {
        "CHECKVIST_USERNAME": "your-email@example.com",
        "CHECKVIST_API_KEY": "your-remote-api-key"
      }
    }
  }
}
```

---

## Usage examples

### Browse your lists

```
List all my Checkvist checklists
```

### Review a list with full hierarchy

```
Get all tasks from my "Work Projects" checklist
```

Output looks like:

```
Work Projects — 42 tasks shown

[ ] Strategy > Q4 Planning > Define OKRs
[ ] Strategy > Q4 Planning > Align with leadership
[x] Strategy > Q4 Planning > Draft budget
[ ] Engineering > Infra > Migrate to v2
...
```

### Daily review

```
Show me all open tasks in my "Inbox" checklist
```

### What's due this week?

```
Show me everything due in the next 7 days across all my lists
```

### Search across everything

```
Search all my checklists for "budget"
```

### Create a task

```
Create a task "Prepare slide deck" in my "Work Projects" checklist, due 2025-06-01
```

### Create a nested task

```
Get tasks from "Work Projects", then create "Research competitors" under task 12345
```

### Complete a task

```
Mark task 98765 in "Work Projects" as complete
```

### Add a note

```
Add a note to task 98765 in "Work Projects": "Reviewed with team, approved"
```

### Checklist health check

```
Give me stats for my "Work Projects" checklist
```

---

## Configuration reference

The server reads two environment variables:

| Variable | Description |
|----------|-------------|
| `CHECKVIST_USERNAME` | Your Checkvist account email |
| `CHECKVIST_API_KEY` | Your Remote API key from your profile page |

---

## Troubleshooting

**"CHECKVIST_USERNAME and CHECKVIST_API_KEY environment variables are required"**
→ Check that your `.env` file exists and is being passed via `--env-file`, or that the env vars are set in the `env` block of your client config.

**"Checkvist auth failed (HTTP 401)"**
→ Your API key is wrong or expired. Regenerate it at [checkvist.com/auth/profile](https://checkvist.com/auth/profile).

**"No checklist named X"**
→ Checklist names are case-insensitive but must match exactly. Use `list_checklists` to see exact names and IDs.

**Server not appearing after configuration**
→ Most clients require a full restart after editing the config file. Use absolute paths — relative paths often fail depending on how the client launches the process.

**Node.js version errors**
→ The `--env-file` flag requires Node.js v20+. Check with `node --version`.

---

## About Checkvist

[Checkvist](https://checkvist.com) is a keyboard-driven outliner and task manager with deep hierarchical nesting, tags, due dates, and a clean REST API. This server uses the [Checkvist Open API](https://checkvist.com/auth/api).

---

## Contributing

Issues and PRs welcome. The entire server is a single file (`index.js`) — adding a new tool means following the pattern of any existing `server.tool(...)` block.

## License

MIT
