---
'directus-agent-skills': minor
---

New `directus-content` skill for editing content as an editor would, over MCP or the API: writes go live (no version writes over MCP or REST items), arrays replace relations, M2M bare ids are junction ids, edit blocks in place, publishing, text formats, and files. `directus` now hands content edits to it.
directus: page-builder (M2A) edits in a content version need each junction row's `collection` in the delta, and versioned reads must select it.
