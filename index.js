#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = 'https://checkvist.com';

// ---------------------------------------------------------------------------
// Auth & API helpers
// ---------------------------------------------------------------------------

function getCredentials() {
  const username = process.env.CHECKVIST_USERNAME;
  const apiKey = process.env.CHECKVIST_API_KEY;
  if (!username || !apiKey) {
    throw new Error(
      'CHECKVIST_USERNAME and CHECKVIST_API_KEY environment variables are required. ' +
      'Get your Remote API key from https://checkvist.com/auth/profile'
    );
  }
  return { username, apiKey };
}

async function getToken(username, apiKey) {
  const url = `${BASE_URL}/auth/login.json?version=2` +
    `&username=${encodeURIComponent(username)}` +
    `&remote_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`Checkvist auth failed (HTTP ${res.status}). Check your credentials.`);
  const data = await res.json();
  if (!data.token) throw new Error(`Auth response missing token: ${JSON.stringify(data)}`);
  return data.token;
}

async function apiFetch(path, token, options = {}) {
  const { method = 'GET', body } = options;
  const sep = path.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${path}${sep}token=${token}`;
  const fetchOpts = { method };
  if (body) {
    fetchOpts.headers = { 'Content-Type': 'application/json' };
    fetchOpts.body = JSON.stringify(body);
  }
  const res = await fetch(url, fetchOpts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Checkvist API error ${res.status} for ${method} ${path}: ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Task hierarchy helpers
// ---------------------------------------------------------------------------

function buildHierarchyMap(tasks) {
  const byId = {};
  for (const t of tasks) byId[t.id] = t;
  return byId;
}

function getTaskPath(task, byId, separator = ' > ') {
  const parts = [];
  let current = task;
  while (current) {
    parts.unshift(current.content);
    current = current.parent_id ? byId[current.parent_id] : null;
  }
  return parts.join(separator);
}

function flattenTasks(tasks, { includeCompleted = true } = {}) {
  const byId = buildHierarchyMap(tasks);
  const result = [];

  function walk(parentId) {
    const children = tasks
      .filter(t => (t.parent_id || 0) === parentId)
      .sort((a, b) => a.position - b.position);
    for (const node of children) {
      if (!includeCompleted && node.status !== 0) { walk(node.id); continue; }
      result.push({
        id: node.id,
        path: getTaskPath(node, byId),
        content: node.content,
        status: node.status === 0 ? 'open' : node.status === 1 ? 'closed' : 'invalid',
        due: node.due || null,
        tags: node.tags || [],
        parent_id: node.parent_id || null,
        position: node.position,
      });
      walk(node.id);
    }
  }

  walk(0);
  return result;
}

function formatTask(item, { showPath = false } = {}) {
  const status = item.status === 'closed' ? '[x]' : item.status === 'invalid' ? '[-]' : '[ ]';
  const due = item.due ? ` (due: ${item.due})` : '';
  const tags = item.tags?.length ? ` [${item.tags.join(', ')}]` : '';
  const label = showPath ? item.path : item.content;
  return `${status} ${label}${due}${tags}`;
}

async function resolveChecklist(nameOrId, token) {
  const lists = await apiFetch('/checklists.json', token);
  if (/^\d+$/.test(String(nameOrId))) {
    const found = lists.find(l => l.id === Number(nameOrId));
    if (!found) throw new Error(`No checklist found with ID ${nameOrId}`);
    return found;
  }
  const lower = nameOrId.toLowerCase();
  const found = lists.find(l => l.name.toLowerCase() === lower);
  if (!found) {
    const names = lists.map(l => `"${l.name}" (${l.id})`).join(', ');
    throw new Error(`No checklist named "${nameOrId}". Available: ${names}`);
  }
  return found;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'checkvist-mcp',
  version: '1.0.0',
});

// ── list_checklists ──────────────────────────────────────────────────────────
server.tool(
  'list_checklists',
  'List all Checkvist checklists for the authenticated account, with task counts and completion stats.',
  {},
  async () => {
    const { username, apiKey } = getCredentials();
    const token = await getToken(username, apiKey);
    const lists = await apiFetch('/checklists.json', token);
    const lines = lists.map(l => {
      const pct = l.task_count > 0
        ? Math.round(((l.task_count - l.open_task_count) / l.task_count) * 100)
        : 0;
      return `[${l.id}] ${l.name}  —  ${l.open_task_count} open / ${l.task_count} total (${pct}% done)`;
    });
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── get_tasks ────────────────────────────────────────────────────────────────
server.tool(
  'get_tasks',
  'Get all tasks from a checklist as a fully flattened list showing the complete hierarchy path for each item (e.g. "Project > Area > Task"). Accepts checklist name or numeric ID.',
  {
    checklist: z.string().describe('Checklist name (e.g. "My Projects") or numeric ID'),
    include_completed: z.boolean().optional().default(true).describe('Include completed tasks (default: true)'),
  },
  async ({ checklist, include_completed = true }) => {
    const { username, apiKey } = getCredentials();
    const token = await getToken(username, apiKey);
    const list = await resolveChecklist(checklist, token);
    const tasks = await apiFetch(`/checklists/${list.id}/tasks.json`, token);
    const flat = flattenTasks(tasks, { includeCompleted: include_completed });
    const lines = flat.map(item => formatTask(item, { showPath: true }));
    const header = `${list.name} — ${flat.length} tasks shown\n`;
    return { content: [{ type: 'text', text: header + '\n' + lines.join('\n') }] };
  }
);

// ── get_open_tasks ───────────────────────────────────────────────────────────
server.tool(
  'get_open_tasks',
  'Get only the open (incomplete) tasks from a checklist, with full hierarchy paths. Useful for a daily review or planning.',
  {
    checklist: z.string().describe('Checklist name or numeric ID'),
  },
  async ({ checklist }) => {
    const { username, apiKey } = getCredentials();
    const token = await getToken(username, apiKey);
    const list = await resolveChecklist(checklist, token);
    const tasks = await apiFetch(`/checklists/${list.id}/tasks.json`, token);
    const flat = flattenTasks(tasks, { includeCompleted: false });
    const open = flat.filter(t => t.status === 'open');
    if (open.length === 0) {
      return { content: [{ type: 'text', text: `✓ No open tasks in "${list.name}"` }] };
    }
    const lines = open.map(item => formatTask(item, { showPath: true }));
    const header = `${list.name} — ${open.length} open tasks\n`;
    return { content: [{ type: 'text', text: header + '\n' + lines.join('\n') }] };
  }
);

// ── get_due_tasks ────────────────────────────────────────────────────────────
server.tool(
  'get_due_tasks',
  'Get all open tasks that have a due date, across all checklists or from a specific one. Sorted by due date ascending.',
  {
    checklist: z.string().optional().describe('Checklist name or ID (omit to search all lists)'),
    days_ahead: z.number().optional().default(7).describe('Only show tasks due within this many days (default: 7, use 0 for overdue only)'),
  },
  async ({ checklist, days_ahead = 7 }) => {
    const { username, apiKey } = getCredentials();
    const token = await getToken(username, apiKey);

    let lists;
    if (checklist) {
      lists = [await resolveChecklist(checklist, token)];
    } else {
      lists = await apiFetch('/checklists.json', token);
    }

    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + days_ahead);

    const dueTasks = [];
    for (const list of lists) {
      const tasks = await apiFetch(`/checklists/${list.id}/tasks.json`, token);
      const flat = flattenTasks(tasks, { includeCompleted: false });
      for (const t of flat) {
        if (!t.due || t.status !== 'open') continue;
        const dueDate = new Date(t.due);
        if (dueDate <= cutoff) {
          dueTasks.push({ ...t, listName: list.name, dueDate });
        }
      }
    }

    dueTasks.sort((a, b) => a.dueDate - b.dueDate);

    if (dueTasks.length === 0) {
      return { content: [{ type: 'text', text: `No tasks due within ${days_ahead} days.` }] };
    }

    const lines = dueTasks.map(t => {
      const overdue = t.dueDate < now ? ' ⚠ OVERDUE' : '';
      return `[ ] [${t.listName}] ${t.path}  (due: ${t.due})${overdue}`;
    });

    return { content: [{ type: 'text', text: `${dueTasks.length} task(s) due:\n\n` + lines.join('\n') }] };
  }
);

// ── search_tasks ─────────────────────────────────────────────────────────────
server.tool(
  'search_tasks',
  'Search for tasks by keyword across all checklists or within a specific one. Returns matching tasks with their full hierarchy paths.',
  {
    query: z.string().describe('Search keyword or phrase (case-insensitive)'),
    checklist: z.string().optional().describe('Limit search to this checklist name or ID (omit to search all)'),
    include_completed: z.boolean().optional().default(false).describe('Include completed tasks in results (default: false)'),
  },
  async ({ query, checklist, include_completed = false }) => {
    const { username, apiKey } = getCredentials();
    const token = await getToken(username, apiKey);

    let lists;
    if (checklist) {
      lists = [await resolveChecklist(checklist, token)];
    } else {
      lists = await apiFetch('/checklists.json', token);
    }

    const lower = query.toLowerCase();
    const results = [];

    for (const list of lists) {
      const tasks = await apiFetch(`/checklists/${list.id}/tasks.json`, token);
      const flat = flattenTasks(tasks, { includeCompleted: include_completed });
      for (const t of flat) {
        if (t.content.toLowerCase().includes(lower)) {
          results.push({ ...t, listName: list.name });
        }
      }
    }

    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No tasks matching "${query}".` }] };
    }

    const lines = results.map(t => {
      const status = t.status === 'closed' ? '[x]' : '[ ]';
      return `${status} [${t.listName}] ${t.path}`;
    });

    return { content: [{ type: 'text', text: `${results.length} result(s) for "${query}":\n\n` + lines.join('\n') }] };
  }
);

// ── create_task ──────────────────────────────────────────────────────────────
server.tool(
  'create_task',
  'Create a new task in a checklist. Optionally nest it under a parent task by providing a parent task ID.',
  {
    checklist: z.string().describe('Checklist name or numeric ID'),
    content: z.string().describe('Task content/title (supports Checkvist markdown)'),
    parent_id: z.number().optional().describe('ID of the parent task to nest under (omit for top-level)'),
    due: z.string().optional().describe('Due date in YYYY-MM-DD format'),
  },
  async ({ checklist, content, parent_id, due }) => {
    const { username, apiKey } = getCredentials();
    const token = await getToken(username, apiKey);
    const list = await resolveChecklist(checklist, token);

    const body = { content };
    if (parent_id) body.parent_id = parent_id;
    if (due) body.due = due;

    const task = await apiFetch(`/checklists/${list.id}/tasks.json`, token, {
      method: 'POST',
      body,
    });

    return {
      content: [{
        type: 'text',
        text: `✓ Created task [${task.id}] "${task.content}" in "${list.name}"`,
      }],
    };
  }
);

// ── update_task ──────────────────────────────────────────────────────────────
server.tool(
  'update_task',
  'Update the content or due date of an existing task.',
  {
    checklist: z.string().describe('Checklist name or numeric ID'),
    task_id: z.number().describe('Task ID to update'),
    content: z.string().optional().describe('New content/title for the task'),
    due: z.string().optional().describe('New due date in YYYY-MM-DD format, or empty string to clear it'),
  },
  async ({ checklist, task_id, content, due }) => {
    const { username, apiKey } = getCredentials();
    const token = await getToken(username, apiKey);
    const list = await resolveChecklist(checklist, token);

    const body = {};
    if (content !== undefined) body.content = content;
    if (due !== undefined) body.due = due;

    const task = await apiFetch(`/checklists/${list.id}/tasks/${task_id}.json`, token, {
      method: 'PUT',
      body,
    });

    return {
      content: [{
        type: 'text',
        text: `✓ Updated task [${task.id}] "${task.content}"`,
      }],
    };
  }
);

// ── complete_task ────────────────────────────────────────────────────────────
server.tool(
  'complete_task',
  'Mark a task as completed (closed).',
  {
    checklist: z.string().describe('Checklist name or numeric ID'),
    task_id: z.number().describe('Task ID to complete'),
  },
  async ({ checklist, task_id }) => {
    const { username, apiKey } = getCredentials();
    const token = await getToken(username, apiKey);
    const list = await resolveChecklist(checklist, token);

    await apiFetch(`/checklists/${list.id}/tasks/${task_id}/close.json`, token, { method: 'POST' });

    return {
      content: [{ type: 'text', text: `✓ Task ${task_id} marked as complete.` }],
    };
  }
);

// ── reopen_task ──────────────────────────────────────────────────────────────
server.tool(
  'reopen_task',
  'Reopen a previously completed task.',
  {
    checklist: z.string().describe('Checklist name or numeric ID'),
    task_id: z.number().describe('Task ID to reopen'),
  },
  async ({ checklist, task_id }) => {
    const { username, apiKey } = getCredentials();
    const token = await getToken(username, apiKey);
    const list = await resolveChecklist(checklist, token);

    await apiFetch(`/checklists/${list.id}/tasks/${task_id}/reopen.json`, token, { method: 'POST' });

    return {
      content: [{ type: 'text', text: `↺ Task ${task_id} reopened.` }],
    };
  }
);

// ── delete_task ──────────────────────────────────────────────────────────────
server.tool(
  'delete_task',
  'Permanently delete a task and all its subtasks. This cannot be undone.',
  {
    checklist: z.string().describe('Checklist name or numeric ID'),
    task_id: z.number().describe('Task ID to delete'),
  },
  async ({ checklist, task_id }) => {
    const { username, apiKey } = getCredentials();
    const token = await getToken(username, apiKey);
    const list = await resolveChecklist(checklist, token);

    await apiFetch(`/checklists/${list.id}/tasks/${task_id}.json`, token, { method: 'DELETE' });

    return {
      content: [{ type: 'text', text: `🗑 Task ${task_id} deleted.` }],
    };
  }
);

// ── get_task_notes ───────────────────────────────────────────────────────────
server.tool(
  'get_task_notes',
  'Retrieve all notes/comments attached to a task.',
  {
    checklist: z.string().describe('Checklist name or numeric ID'),
    task_id: z.number().describe('Task ID'),
  },
  async ({ checklist, task_id }) => {
    const { username, apiKey } = getCredentials();
    const token = await getToken(username, apiKey);
    const list = await resolveChecklist(checklist, token);

    const notes = await apiFetch(`/checklists/${list.id}/tasks/${task_id}/comments.json`, token);

    if (!notes.length) {
      return { content: [{ type: 'text', text: `No notes on task ${task_id}.` }] };
    }

    const lines = notes.map(n => `[${n.id}] ${n.comment}  — ${n.updated_at}`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── add_task_note ────────────────────────────────────────────────────────────
server.tool(
  'add_task_note',
  'Add a note or comment to a task.',
  {
    checklist: z.string().describe('Checklist name or numeric ID'),
    task_id: z.number().describe('Task ID'),
    note: z.string().describe('Note text to add'),
  },
  async ({ checklist, task_id, note }) => {
    const { username, apiKey } = getCredentials();
    const token = await getToken(username, apiKey);
    const list = await resolveChecklist(checklist, token);

    const comment = await apiFetch(
      `/checklists/${list.id}/tasks/${task_id}/comments.json`,
      token,
      { method: 'POST', body: { comment: note } }
    );

    return {
      content: [{ type: 'text', text: `✓ Note added [${comment.id}]: "${comment.comment}"` }],
    };
  }
);

// ── get_checklist_stats ──────────────────────────────────────────────────────
server.tool(
  'get_checklist_stats',
  'Get a summary breakdown of a checklist: total tasks, open vs closed, tasks by depth level, and any overdue items.',
  {
    checklist: z.string().describe('Checklist name or numeric ID'),
  },
  async ({ checklist }) => {
    const { username, apiKey } = getCredentials();
    const token = await getToken(username, apiKey);
    const list = await resolveChecklist(checklist, token);
    const tasks = await apiFetch(`/checklists/${list.id}/tasks.json`, token);
    const flat = flattenTasks(tasks);

    const total = flat.length;
    const open = flat.filter(t => t.status === 'open').length;
    const closed = flat.filter(t => t.status === 'closed').length;
    const withDue = flat.filter(t => t.due).length;

    const now = new Date();
    const overdue = flat.filter(t => t.due && t.status === 'open' && new Date(t.due) < now).length;

    const depths = {};
    for (const t of flat) {
      const depth = t.path.split(' > ').length;
      depths[depth] = (depths[depth] || 0) + 1;
    }
    const depthLines = Object.entries(depths)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([d, c]) => `  Level ${d}: ${c} tasks`);

    const pct = total > 0 ? Math.round((closed / total) * 100) : 0;

    const text = [
      `📋 ${list.name}`,
      ``,
      `Total tasks:    ${total}`,
      `Open:           ${open}`,
      `Closed:         ${closed}  (${pct}% complete)`,
      `With due dates: ${withDue}`,
      `Overdue:        ${overdue}`,
      ``,
      `Depth breakdown:`,
      ...depthLines,
    ].join('\n');

    return { content: [{ type: 'text', text }] };
  }
);

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
