// Same checks as content-draft, through MCP (no versions tool there).
process.env.CHECK_MODE = 'mcp';
await import('./content-draft.mjs');
