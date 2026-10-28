---
'directus-agent-skills': patch
---

directus-upgrade: health checks probe `127.0.0.1`, not `localhost` (the image's `wget` fails on `::1`).
directus-upgrade: the caller grep step names the SDK breaking-changes table.
directus-extensions: auto reload misses an extension's first build (touch package.json or restart), and Docker Desktop bind mounts need CHOKIDAR_USEPOLLING.
directus: JSON field filtering (`_json` flat paths, numbers as JSON, `json()` response keys and aliases, Postgres text sort).
