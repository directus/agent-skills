# Configuration

- [How env is read](#how-env-is-read)
- [SECRET and KEY](#secret-and-key)
- [PUBLIC_URL](#public_url)
- [Database](#database)
- [First admin](#first-admin)
- [Proxies, CORS, cookies](#proxies-cors-cookies)
- [Rate limiting](#rate-limiting)
- [Email](#email)
- [File storage](#file-storage)
- [Logs and telemetry](#logs-and-telemetry)

Only the variables that cause trouble. Every variable and its default: https://directus.com/docs/configuration/intro.

## How env is read

- Values are type-guessed (`"true"` → boolean, `"1"` → number). Force a type with a prefix: `array:`, `json:`,
  `string:`.
- Any Directus variable accepts a `_FILE` suffix to read the value from a file: `DB_PASSWORD_FILE=/run/secrets/db`.
  Use it with Docker or Kubernetes secrets.
- Nested options use double underscores: `DB_POOL__MAX`, `DB_SSL__CA_FILE`.

## SECRET and KEY

`SECRET` signs access tokens, refresh/session tokens, share and password-reset tokens, and is the encryption key for
fields stored encrypted: the AI provider API keys, `license_key`, and `license_token` in settings, and deployment
credentials.

- **Changing it** logs everyone out and makes those encrypted values decrypt to `null` (the log says
  `Failed to decrypt field value`). Re-enter the AI keys and license after a deliberate rotation.
- **Unset**, each process generates its own random value (startup warns). Tokens die on restart and fail across
  replicas or `PM2_INSTANCES` > 1.
- Under 32 bytes, startup warns it's insecure. `openssl rand -base64 32` or `node /directus/cli.js security secret:generate`.
- Same `SECRET` on every replica of one project. Different per environment (dev, staging, prod).
- **`KEY` is not read by Directus 12.** Old compose files and tutorials set it; it's harmless and can go.

## PUBLIC_URL

Default `/` (startup warns `"PUBLIC_URL" should be a full URL`). Set it to the exact public HTTPS URL, no trailing path
unless Directus is served under one. It builds password-reset and invite links in emails, SSO callback URLs
(`<PUBLIC_URL>/auth/login/<provider>/callback`), and MCP OAuth metadata. A full URL is required for SSO and licensed features
beyond core.

## Database

- `DB_CLIENT`: `pg`, `mysql` (also MariaDB), `sqlite3`, `mssql`, `oracledb`, `cockroachdb`. Then `DB_HOST`, `DB_PORT`,
  `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`, or `DB_CONNECTION_STRING` (Postgres only), or `DB_FILENAME` (SQLite).
- **TLS to a managed database:** `DB_SSL__REJECT_UNAUTHORIZED`, `DB_SSL__CA_FILE` (any `DB_SSL__*` goes to the
  driver).
- One database, one schema. Directus doesn't support splitting one database across several schemas.
- Pool size: [scaling.md](scaling.md#database-pool).

## First admin

`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_TOKEN` (static token for automation) are used **only when bootstrap installs
into an empty database**, and only if email and password are both set. Later changes are ignored. Leave them unset to
use the Studio onboarding screen. Lost password: `node /directus/cli.js users passwd --email <e> --password <p>`.

**Recommended:** remove `ADMIN_PASSWORD` from the env after the first boot, and rotate the admin password and
`ADMIN_TOKEN` in the Studio.

## Proxies, CORS, cookies

- **`IP_TRUST_PROXY`** (default `false`) is Express `trust proxy`. Accepts `true`, a hop count (`1`), or a
  comma-separated list of proxy IPs or CIDRs. With `false`, rate limits, policy `ip_access` allowlists, and activity
  logs see the proxy's IP. **Recommended:** use a hop count or the proxy's CIDR, not `true`; `true` trusts any
  client-sent `X-Forwarded-For`, so a client can pick its own IP and dodge rate limits or allowlists.
- A reverse proxy in front (nginx shown; Caddy and Traefik pass these by default) needs the forwarded headers,
  WebSocket upgrades if `WEBSOCKETS_ENABLED=true`, and a body limit at least as big as your largest upload:

  ```nginx
  location / {
    proxy_pass http://directus:8055;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;     # WebSockets
    proxy_set_header Connection "upgrade";
    proxy_http_version 1.1;
    client_max_body_size 100m;                  # default 1m caps uploads
  }
  ```

- `IP_CUSTOM_HEADER` reads the client IP from one header instead (for example `CF-Connecting-IP` behind Cloudflare).
- **CORS is off by default** (`CORS_ENABLED=false`). Only browsers calling Directus from another origin need it. Set
  `CORS_ENABLED=true` and list origins: `CORS_ORIGIN=array:https://www.example.com,https://preview.example.com`.
  `CORS_ORIGIN=true` reflects any origin while `CORS_CREDENTIALS` is `true` by default: any site can make credentialed
  calls. Avoid in production.
- Cookies default to `SESSION_COOKIE_SECURE=false`, `SameSite=lax`. On HTTPS set `SESSION_COOKIE_SECURE=true` and
  `REFRESH_TOKEN_COOKIE_SECURE=true`. A frontend on another site that relies on cookies needs `..._SAME_SITE=none`
  plus secure (browsers drop `none` without it). Live Preview cookies and framing: `directus-visual-editing`.

## Rate limiting

Off by default: `RATE_LIMITER_ENABLED` (per IP, 50 requests per second), `RATE_LIMITER_GLOBAL_ENABLED`,
`RATE_LIMITER_EMAIL_ENABLED`. On by default: `RATE_LIMITER_REGISTRATION_ENABLED` (5 per 60 seconds on public
registration).

- `RATE_LIMITER_STORE=memory` (default) counts per process. With several instances use `redis`, or each replica allows
  the full budget.
- Over the limit: 429 with `Retry-After`. If everyone is limited together, check `IP_TRUST_PROXY` first.
- A 503 `Under pressure` is not the rate limiter: it's the pressure limiter (on by default, trips on event loop delay
  over 500 ms). See [scaling.md](scaling.md#overload-and-503s).

## Email

- Default `EMAIL_TRANSPORT=sendmail` uses `/usr/sbin/sendmail`, which in the image is busybox. Set a real transport:
  `smtp`, `ses`, `mailgun`, or `mailtrap`, with its `EMAIL_<TRANSPORT>_*` vars.
- Set `EMAIL_FROM` (default `no-reply@example.com`) to an address your provider is allowed to send for.
- SMTP: `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASSWORD`, `EMAIL_SMTP_SECURE`.
- A broken transport never fails a request. At startup (`EMAIL_VERIFY_SETUP=true`) it logs `Email connection failed`;
  invite and password-reset sends that fail log `Could not send ... mail` and the API still returns success. Check the
  logs after the first invite.
- Links in system emails come from `PUBLIC_URL`. Custom `reset_url` / `invite_url` targets must be in
  `PASSWORD_RESET_URL_ALLOW_LIST` / `USER_INVITE_URL_ALLOW_LIST`.
- Templates: `.liquid` files in `EMAIL_TEMPLATES_PATH` (`/directus/templates` in the image).

## File storage

```bash
STORAGE_LOCATIONS=s3                      # first location = where new uploads go
STORAGE_S3_DRIVER=s3
STORAGE_S3_BUCKET=my-directus-files
STORAGE_S3_REGION=eu-central-1
STORAGE_S3_KEY=...                        # omit KEY and SECRET to use the AWS default chain (IAM role)
STORAGE_S3_SECRET=...
# S3-compatible (R2, MinIO, Spaces): STORAGE_S3_ENDPOINT=https://<host>; MinIO also STORAGE_S3_FORCE_PATH_STYLE=true
# STORAGE_S3_ROOT=directus/               # optional prefix inside the bucket
```

- Drivers: `local`, `s3`, `gcs`, `azure`, `cloudinary`, `supabase`. Default is `local` at `./uploads`.
- **Each file row stores its location name** (`directus_files.storage`) and is read from that location. Never rename
  or drop a location that still has files; add the new one and keep the old one listed. Moving existing files means
  copying the objects and updating `storage` per row.
- Upload limits: `FILES_MAX_UPLOAD_SIZE` (unset = no limit), `FILES_MIME_TYPE_ALLOW_LIST` (default `*/*`).
  `MAX_PAYLOAD_SIZE` (default `1mb`) limits JSON bodies, not file uploads. A reverse proxy body limit also caps uploads (nginx
  `client_max_body_size` defaults to `1m`).
- Chunked uploads (TUS) are off by default: `TUS_ENABLED=true`. It needs a full `PUBLIC_URL`, and Redis for its locks once
  there are several instances.

## Logs and telemetry

- `LOG_LEVEL` (default `info`; `debug` or `trace` for troubleshooting), `LOG_STYLE=raw` for JSON lines to a log
  shipper, `LOG_HTTP_IGNORE_PATHS=/server/ping` to keep probe noise out.
- `TELEMETRY=false` stops the usage report only if your license allows it (some require it; check **Settings →
  License**). `PROJECT_OWNER_ENABLED=false` stops the one-time owner registration.
- From 12.6.0 telemetry and compliance reports go to `https://telemetry.directus.com` (`TELEMETRY_URL`,
  `COMPLIANCE_URL`). A failed report logs nothing, so a firewall that blocks it fails silently. Allow that egress when
  your license requires reporting.
- npm installs (not Docker) need Node 26 from 12.6.0 (`engines.node >=26`).

## Sources

- https://directus.com/docs/configuration/intro
- https://directus.com/docs/configuration/general
- https://directus.com/docs/configuration/database
- https://directus.com/docs/configuration/security-limits
- https://directus.com/docs/configuration/email
- https://directus.com/docs/configuration/files
- https://directus.com/docs/configuration/logging
- https://directus.com/docs/licensing/telemetry
- https://github.com/directus/directus/blob/v12.6.0/packages/env/src/constants/defaults.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/app.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/get-secret.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/payload.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/get-ip-from-req.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/rate-limiter.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/constants.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/storage-driver-s3/src/index.ts
