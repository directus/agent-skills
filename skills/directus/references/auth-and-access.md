# Auth

How requests authenticate and how to inspect a caller. Roles, policies, permissions, and licensing effects (core-tier
limits, lockdown, SSO users triggering lockdown) are the `directus-access-control` skill. While querying, remember:
Admin Access bypasses all permissions, and `GET /permissions/me` shows what the current token can do.

## Sending credentials

| Method         | How                                                         | Use for                                                                          |
| -------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Header         | `Authorization: Bearer <token>`                             | Servers, scripts, agents. Preferred.                                             |
| Session cookie | `directus_session_token`, sent by the browser automatically | Browser apps on the same site, with `credentials: "include"`                     |
| Query param    | `?access_token=<token>`                                     | Only when nothing else works (asset URLs, some MCP clients). It ends up in logs. |

No credential means the request runs as the **public policy** (the Public role in the Studio).

## Login, refresh, logout

```bash
curl -X POST "$DIRECTUS_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"secret","mode":"json"}'
# => { "data": { "access_token": "...", "refresh_token": "...", "expires": 900000 } }
```

`expires` is the access token lifetime in milliseconds. Add `"otp": "123456"` if the user has 2FA.

| `mode`                 | Access token                                                 | Refresh token                              |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| `json` (login default) | In the body                                                  | In the body                                |
| `cookie`               | In the body                                                  | `httpOnly` cookie `directus_refresh_token` |
| `session`              | `httpOnly` cookie `directus_session_token` (not in the body) | Same cookie; one token does both           |

- **Refresh:** `POST /auth/refresh` with `{ "refresh_token": "...", "mode": "json" }`, or just `{ "mode": "cookie" }` /
  `{ "mode": "session" }` when the cookie carries it. Refresh tokens rotate; store the new one.
- **Logout:** `POST /auth/logout` with the refresh token (or `mode` for cookies).
- Refresh and logout pick the mode differently from login: an explicit `mode` wins, a body `refresh_token` means
  `json`, and **otherwise `cookie`**. A session-mode client that sends `{}` gets "no refresh token"; send
  `{ "mode": "session" }`.
- **Defaults:** `ACCESS_TOKEN_TTL=15m`, `REFRESH_TOKEN_TTL=7d`, `SESSION_COOKIE_TTL=1d`.
- **Expired token:** `TOKEN_EXPIRED` (401). Refresh, then retry once.

## Static tokens

- One per user, never expires, stored in plain text in `directus_users.token`.
- Generate in the Studio on the user page, or `PATCH /users/<id>` with `{ "token": "<random string>" }`
  (`GET /utils/random/string` makes one).
- The token carries the user's full permissions. **House rule:** create a dedicated user with a scoped role for each
  integration or agent, not a personal admin account.
- Users without App Access or Admin Access are API-only and don't count as a licensed seat.

## SSO and external providers

Configure with `AUTH_PROVIDERS` and `AUTH_<PROVIDER>_*` env vars (https://directus.com/docs/configuration/auth-sso).

- Browser login: link to `/auth/login/<provider>?redirect=<your app URL>`. The redirect target must be in
  `AUTH_<PROVIDER>_REDIRECT_ALLOW_LIST`. Then call `POST /auth/refresh` with `credentials: "include"` to get a token
  or session.
- Cross-domain session cookies need `SESSION_COOKIE_DOMAIN`, `SESSION_COOKIE_SECURE=true`, and
  `SESSION_COOKIE_SAME_SITE=None`.
- SSO needs a license on v12. On the core tier `/auth/login/<provider>` returns 404 `ROUTE_NOT_FOUND`, except during
  the post-upgrade grace period or lockdown, when it stays open so admins can sign in.
- Third-party JWTs can be accepted instead of Directus-issued tokens; see the docs tutorial on validating third-party
  JWTs.

## Inspecting a caller

| Request                                                        | Returns                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| `GET /users/me?fields=id,email,role.name,policies.policy.name` | Who the token is                                           |
| `GET /permissions/me`                                          | Effective permissions per collection and action            |
| `GET /policies/me/globals`                                     | `admin_access`, `app_access`, `enforce_tfa` for the caller |
| `GET /roles/me`                                                | The caller's roles                                         |

## Sources

- https://directus.com/docs/guides/auth/tokens-cookies
- https://directus.com/docs/guides/auth/email-login
- https://directus.com/docs/guides/auth/access-control
- https://directus.com/docs/guides/auth/sso/seamless
- https://directus.com/docs/configuration/auth-sso
- https://directus.com/docs/guides/security/best-practices
- https://directus.com/docs/licensing/overview
- https://directus.com/docs/releases/breaking-changes/version-12
- https://github.com/directus/directus/blob/v12.6.0/api/src/auth/drivers/local.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/auth.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/auth/utils/check-sso-enabled.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/env/src/constants/defaults.ts
