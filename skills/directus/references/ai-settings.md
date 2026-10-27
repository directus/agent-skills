# AI settings

Directus's built-in AI features, where they are configured, and which need a license. Connecting an external AI client
to `/mcp` and the MCP settings: [mcp.md](mcp.md).

## What's built in

| Feature             | What it is                                                                                                      | Who can use it                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| AI Assistant        | Chat sidebar in the Studio. Calls the same tools as MCP (`items`, `files`, `schema`, ...) as the signed-in user | Users with App Access. Not public, not API-only                         |
| AI Translations     | **Translate with AI** button on translations fields; fills other languages from a source language               | Studio users with write access to the translations collection; licensed |
| MCP server (`/mcp`) | Lets external AI clients use the tools. Off until an admin enables it                                           | Any user with a token or MCP OAuth; see [mcp.md](mcp.md)                |

All three share **Settings → AI**. The assistant and translations also share the provider keys.

## Env switches

| Variable               | Default | Effect                                                                                                     |
| ---------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `AI_ENABLED`           | `true`  | `false` unmounts `/ai`, hides the assistant for everyone, and disables the AI settings form                |
| `MCP_ENABLED`          | `true`  | `false` stops admins enabling the MCP server                                                               |
| `AI_TELEMETRY_ENABLED` | `false` | Sends assistant traces to `langfuse` or `braintrust` (`AI_TELEMETRY_PROVIDER`). Includes user and role ids |

`AI_TELEMETRY_RECORD_IO=true` also sends full prompts and responses. Ask before turning it on.

## Provider settings

Admin-only fields on `/settings` (the **Settings → AI** form):

| Field                                                                                   | Notes                                                                                                          |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ai_openai_api_key`, `ai_anthropic_api_key`, `ai_google_api_key`                        | Encrypted at rest; reads return `**********`. One key per project, shared by every user                        |
| `ai_openai_allowed_models`, `ai_anthropic_allowed_models`, `ai_google_allowed_models`   | Array of model ids. `null` (12.6.0+) means the recommended defaults, which change between releases; `[]` means none. Chat rejects models not in the list. Custom ids allowed |
| `ai_system_prompt`                                                                      | Extra instructions for the assistant                                                                           |
| `ai_openai_compatible_name`, `_base_url`, `_api_key`, `_headers`, `_models`             | Any OpenAI-compatible endpoint (Ollama, LM Studio, Azure OpenAI, ...). **Licensed**                            |
| `ai_translation_default_model`, `ai_translation_glossary`, `ai_translation_style_guide` | Translations only. Glossary is a list of term + note pairs                                                     |

```bash
curl -X PATCH "$DIRECTUS_URL/settings" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"ai_anthropic_api_key":"<key>"}'
```

- Never echo a key back to the user or write it into a file. Ask the user to paste it into **Settings → AI** if you
  can't keep it out of logs.
- `GET /server/info` (signed in) reports `ai_enabled` and `ai_providers` (which providers have keys), so check that
  instead of reading the key fields.
- File attachments in the assistant need a built-in provider (OpenAI, Anthropic, Google). OpenAI-compatible models
  can't take them.

## Licensing

Checked on 12.5.1 core tier (`GET /license` entitlements):

| Entitlement               | Core    | Effect                                                                                                                                           |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `custom_llms_enabled`     | `false` | Saving any `ai_openai_compatible_*` field returns 403 `RESOURCE_RESTRICTED`, category `custom_llms_enabled`. Reads of those fields return `null` |
| `ai_translations_enabled` | `false` | The Studio hides **Translate with AI** and locks the translation settings. The check is in the Studio                                            |

OpenAI, Anthropic, and Google keys, the AI Assistant, and the MCP server work on core. MCP stops with everything else
when the instance is locked. Other licensing effects: `directus-access-control` (`references/licensing.md`).

## Traps

- **The assistant can't be used from a website or app.** `/ai/chat` and `/ai/object` return 403 for users without App
  Access. For AI in your own product, call the provider from your backend and use Directus as data.
- **It acts with the user's permissions.** An admin's assistant can drop collections. Tools ask for approval by default;
  don't tell users to auto-approve deletes or schema tools.
- **Data leaves the instance.** Messages, schema, item data, and tool results go to the provider. Conversations live
  in the browser's local storage, not in Directus.
- **Cost is shared.** Every user runs on the project's key. Limit models in the allowed lists and set spend limits at
  the provider.

## Sources

- https://directus.com/docs/configuration/ai
- https://directus.com/docs/guides/ai/assistant/setup
- https://directus.com/docs/guides/ai/assistant/security
- https://directus.com/docs/guides/ai/assistant/tools
- https://directus.com/docs/guides/ai/translations
- https://directus.com/docs/licensing/overview
- https://github.com/directus/directus/blob/v12.6.0/packages/system-data/src/fields/settings.yaml
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/settings.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/constants.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/server.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/ai/chat/controllers/chat.post.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/ai/chat/controllers/object.post.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/license/entitlements/lib/custom-llms-enabled.ts
- https://github.com/directus/directus/blob/v12.6.0/app/src/interfaces/translations/translations.vue
- https://github.com/directus/directus/blob/v12.6.0/app/src/modules/settings/routes/ai/overview.vue
