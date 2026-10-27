---
"directus-agent-skills": minor
---

Verify every skill against Directus 12.6.0: the 12.6.0 upgrade hop (Node 26, no Corepack in `node:26` images, telemetry endpoint, AI model defaults, `/mcp` 405, export folder setting), the 12.6 SDK and extensions version map, `richtext` extensions, and source links pinned to v12.6.0. Read core-tier limits from `GET /license` instead of hardcoding them, trim the extensions references, and fix third-round review findings (core-tier delete rows, flows `request` errors, auth refresh mode, Insights variables and editing, Kubernetes notes). Behavior evals take `--image` and default to 12.6.0.
