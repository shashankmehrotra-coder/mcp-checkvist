# checkvist-mcp

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that connects [Claude](https://claude.ai) to [Checkvist](https://checkvist.com) — giving you full task management capabilities directly in your Claude conversations.

## What it does

Once configured, you can talk to Claude naturally about your tasks:

> *"What's open in my Work checklist?"*
> *"Create a task called 'Review Q3 report' under the Planning section, due Friday"*
> *"Search all my lists for anything related to Project-X"*
> *"Show me everything overdue across all my checklists"*

---

## Tools available

| Tool | Description |
|------|-------------|
| `list_checklists` | List all your Checkvist lists with open/total counts and % complete |
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

- [Node.js](https://nodejs.org) v20 or later (uses the built-in `--env-file` flag)
- A [Checkvist](https://checkvist.com) account
- [Claude Code](https://claude.ai/code) or another MCP-compatible Claude client

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/your-username/checkvist-mcp.git
cd checkvist-mcp
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

> **Security note:** `.env` is listed in `.gitignore` and will never be committed. Never share your API key or commit it to source control.

### 4. Configure Claude Code

Add the server to your Claude Code global settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "checkvist": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/checkvist-mcp/.env",
        "/absolute/path/to/checkvist-mcp/index.js"
      ]
    }
  }
}
```

Replace `/absolute/path/to/checkvist-mcp` with the actual path where you cloned this repo.

### 5. Restart Claude Code

Fully quit and relaunch Claude Code. The MCP server loads at startup. You should see `checkvist` in the connected servers list.

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
[ ] Work Projects — 42 tasks shown

[ ] Strategy > Q4 Planning > Define OKRs
[ ] Strategy > Q4 Planning > Align with leadership
[x] Strategy > Q4 Planning > Draft budget
[ ] Engineering > Infra > Migrate to v2
...
```

### Daily standup view

```
Show me all open tasks in my "Inbox" checklist
```

### What's due this week?

```
Show me everything due in the next 7 days across all my lists
```

### Search across everything

```
Search all my checklists for "HDFC"
```

### Create a task

```
Create a task "Prepare slide deck" in my "Work Projects" checklist, due 2025-06-01
```

### Create a nested task

```
First get the tasks from "Work Projects" so I can find the parent ID, 
then create "Research competitors" nested under task 12345
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

## Configuration options

The server reads two environment variables:

| Variable | Description |
|----------|-------------|
| `CHECKVIST_USERNAME` | Your Checkvist account email |
| `CHECKVIST_API_KEY` | Your Remote API key from your profile page |

You can pass these via:
- A `.env` file with `--env-file` (recommended, shown above)
- System environment variables
- The `env` block in your MCP server config in `settings.json`

---

## Using with other MCP clients

This server uses the standard [MCP stdio transport](https://modelcontextprotocol.io/docs/concepts/transports) and works with any compatible client. The command to start it is:

```bash
node --env-file=/path/to/.env /path/to/index.js
```

Or, if you've set environment variables another way:

```bash
CHECKVIST_USERNAME=you@example.com CHECKVIST_API_KEY=yourkey node /path/to/index.js
```

---

## Troubleshooting

**"CHECKVIST_USERNAME and CHECKVIST_API_KEY environment variables are required"**
→ Make sure your `.env` file exists and is being passed via `--env-file`, or that the env vars are set in your shell / MCP config.

**"Checkvist auth failed (HTTP 401)"**
→ Your API key is wrong or expired. Regenerate it at [checkvist.com/auth/profile](https://checkvist.com/auth/profile).

**"No checklist named X"**
→ Checklist names are case-insensitive but must match exactly. Use `list_checklists` to see the exact names.

**Server not appearing in Claude Code**
→ Make sure you fully quit and relaunched Claude Code after editing `settings.json`. Use absolute paths for both the `.env` file and `index.js`.

---

## About Checkvist

[Checkvist](https://checkvist.com) is a keyboard-driven outliner and task manager that supports deep hierarchical nesting, tags, due dates, and a clean REST API. This MCP server uses the [Checkvist Open API](https://checkvist.com/auth/api).

---

## Contributing

Issues and PRs welcome. The server is a single file (`index.js`) — adding a new tool is straightforward: follow the pattern of any existing `server.tool(...)` block.

## License

MIT
