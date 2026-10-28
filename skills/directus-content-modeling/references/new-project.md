# New project from a starter

The path for "start a new Directus + <framework> site" at 12.6.0: pick a starter, run Directus, load the starter's
schema and content, wire the frontend, check it. How each schema tool works: [applying-schema.md](applying-schema.md).

- [Pick a starter](#pick-a-starter)
- [Run Directus and load the starter](#run-directus-and-load-the-starter)
- [Wire the frontend](#wire-the-frontend)
- [Known starter issues](#known-starter-issues)
- [First checks after setup](#first-checks-after-setup)

## Pick a starter

Starters live in `directus-labs/starters`. The folder name is the `--template` id.

| Starter | Frontends (`--frontend` id) | Tier | What it is |
| --- | --- | --- | --- |
| `cms` | `nextjs`, `nuxt`, `astro`, `svelte` (folder `sveltekit`) | Core. `template-licensed/` variant needs a license | Page builder, blog, forms, Live Preview, Visual Editor |
| `cms-i18n` | `nextjs`, `nuxt` | Needs a license: 37 collections, over core's limit | The CMS plus `*_translations`, locale routing, language switcher |
| `blank` | none | Core | Docker Compose only, no schema |

No starter for the user's framework? Apply the `cms` Directus template on its own and write the frontend with
`directus-sdk`, copying the data layer from the closest starter.

## Run Directus and load the starter

| Situation | Do |
| --- | --- |
| Local, `cms` core, Docker running | `init`: one command for all of it |
| `cms-i18n`, the licensed CMS variant, or an existing local instance | Manual: `docker compose up -d` in `directus/`, then `apply` |
| Directus Cloud | Pick the CMS template when creating the project, then wire the frontend |
| Production or a custom Docker setup | `directus-self-hosting` skill, then `apply` against that instance |

```bash
npx directus-template-cli@latest init my-site --template=cms --frontend=nextjs --installDeps --no-gitInit
```

`init` downloads the starter, copies every `.env.example` to `.env`, runs `docker compose up -d` in `directus/`, waits
for `/server/info`, applies `directus/template` as `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `directus/.env`, then installs
frontend deps. It always runs the interactive flow; pass the directory and flags above to skip the prompts. An unknown
`--frontend` id prompts instead of failing.

Manual apply, verbatim from `cms/directus/README.md` (run in `directus/`, token = static token on the admin user):

```bash
npx directus-template-cli@latest apply -p \
  --directusUrl="http://localhost:8055" \
  --directusToken="YOUR_TOKEN" \
  --templateLocation="./template" \
  --templateType="local"
```

- **The starter `.env.example` ships a fixed `DIRECTUS_SECRET` and `ADMIN_EMAIL=admin@example.com` /
  `ADMIN_PASSWORD=d1r3ctu5`.** First boot creates that admin from them, so log in with those (the READMEs say "complete
  onboarding"). Replace all three before the instance is reachable by anyone else.
- **`init` ignores licensing.** It applies `template/` before you can set `LICENSE_KEY`. For `cms-i18n` or the licensed
  CMS: set `LICENSE_KEY` in `directus/.env`, `docker compose up -d --force-recreate directus`, then `apply` with
  `--templateLocation="./template-licensed"` (CMS) or `./template` (i18n) on a fresh database.
- **Apply once, on a fresh instance.** It overwrites your collections' items with matching primary keys and skips
  existing system records, so re-running doesn't replace permissions. To license a CMS instance already applied with
  `template/`, the starters README uses `pnpm rbac:sync-licensed` from the starters repo root (`init` doesn't copy
  `_scripts/`).
- **A `custom_permission_rules_enabled` 403 during a core apply is expected.** The CLI probes licensed features.

**House rule:** start from a starter with the template CLI, once, on dev. Then the dev instance is the source of truth:
track schema and config with `d6s sync pull` and promote with `d6s sync push`. Don't re-apply the template to staging
or production.

At 12.6.0 the template CLI is the only tool that loads a starter: the starters ship template files, not Environment
Sync files, and `d6s` doesn't move content. Once the starter is applied to your dev instance, track schema and config
from there with `d6s sync pull` (`directus-environment-sync`) and seed later content with a script
([applying-schema.md](applying-schema.md#seeding-content)).

## Wire the frontend

| Frontend | Directus URL | Site URL | Visual editing flag |
| --- | --- | --- | --- |
| Next.js | `NEXT_PUBLIC_DIRECTUS_URL` | `NEXT_PUBLIC_SITE_URL` | `NEXT_PUBLIC_ENABLE_VISUAL_EDITING` |
| Nuxt | `DIRECTUS_URL` | `NUXT_PUBLIC_SITE_URL` | `NUXT_PUBLIC_ENABLE_VISUAL_EDITING` |
| Astro, SvelteKit | `PUBLIC_DIRECTUS_URL` | `PUBLIC_SITE_URL` | `PUBLIC_ENABLE_VISUAL_EDITING` |

- `DIRECTUS_SERVER_TOKEN` (server-only) is, per the starter READMEs, the admin user's static token: Users Directory,
  open the user, generate a token, **Save** (unsaved tokens give "Invalid token"). Fine on a local dev instance. Before
  deploying, use a non-admin user instead: the Next.js README names one with only `Content - Live Preview` and
  `Forms - Submission` (licensed). Why it matters: `directus-sdk` (references/frameworks.md) and
  `directus-visual-editing`.
- `DIRECTUS_ADMIN_TOKEN` is only for `pnpm run generate:types`. Never put either token in `NEXT_PUBLIC_*`, `PUBLIC_*`,
  or Nuxt public runtime config. After a database reset, regenerate both and restart the dev server (symptom: 401).
- Preview in the Studio iframe needs the frontend's origin in `CONTENT_SECURITY_POLICY_DIRECTIVES__FRAME_SRC`; the
  starter `.env.example` covers ports 3000, 4321, and 5173. Cloud previews of a local frontend need an HTTPS tunnel.

## Known starter issues

Fix these before the project leaves your machine. Each is documented once:

- Core-template permissions that expose users and files and let staff edit any user: `directus-access-control`
  (references/cms-starter-blueprint.md, "Fix the core template first").
- Editors can't save drafts (no `directus_versions` permissions): same file, "Adapting it".
- Preview URLs hardcode `http://localhost:3000`: `directus-visual-editing` (references/directus-setup.md).
- `SET NULL` on junctions and translations, nullable `permalink`, non-unique `slug`: the "Reference implementation"
  list in this skill's SKILL.md.
- Admin-token reads and ungated `?preview=true` in the frontends: `directus-sdk` and `directus-visual-editing`.

## First checks after setup

1. `GET /server/info` with the admin token: `data.version` matches the Compose image tag.
2. `GET /license` (admin): the tier you expected. Compare `usage.collections` with `entitlements.collections.limit`;
   the `cms` starter uses 22.
3. Users: your admin, Frontend Bot, and Content Writer (`writer@example.com`).
4. The frontend home page renders, and a page edited in Content shows up after a reload.
5. Live Preview opens from a page item without a CSP error.
6. `GET /items/pages` with no token. On core it returns drafts too (the frontend filters them). Decide whether that's
   acceptable: `directus-access-control` (references/licensing.md).
7. `pnpm install` (if `init` didn't), then `pnpm run generate:types` and `pnpm run dev` in the frontend folder.

## Sources

- https://github.com/directus-labs/starters/tree/main/README.md
- https://github.com/directus-labs/starters/tree/main/cms/directus/README.md
- https://github.com/directus-labs/starters/tree/main/cms/directus/.env.example
- https://github.com/directus-labs/starters/tree/main/cms/package.json
- https://github.com/directus-labs/starters/tree/main/cms-i18n/README.md
- https://github.com/directus-labs/starters/tree/main/cms/nextjs/README.md
- https://github.com/directus-labs/directus-template-cli/blob/main/README.md
- https://github.com/directus-labs/directus-template-cli/blob/main/src/lib/init/index.ts
- https://github.com/directus-labs/directus-template-cli/blob/main/src/commands/init.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/create-admin.ts
- https://directus.com/docs/frameworks/nextjs/build-a-cms
- https://directus.com/docs/licensing/overview
