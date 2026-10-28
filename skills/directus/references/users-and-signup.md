# Users and signup

Website members and customers: public registration, email verification, password reset, invites, and logging members
in from a frontend. Permissions for members belong to `directus-access-control`; SDK login code to `directus-sdk`.

## Contents

- [Members cost no seats, unless they get App Access](#members-cost-no-seats-unless-they-get-app-access)
- [Public registration](#public-registration)
- [Password reset](#password-reset)
- [Invites](#invites)
- [Logging members in from a frontend](#logging-members-in-from-a-frontend)

## Members cost no seats, unless they get App Access

On the core tier (seat limit in `GET /license`), a seat is an **active** user with at least one policy granting App Access or Admin Access.
A member role whose policies have `app_access: false` and `admin_access: false` takes no seat, however many members
register. Checked on 12.5.1: four registrations into such a role left seat usage at 1.

If the registration role grants App Access, every signup takes a seat. Once the limit is hit, `/users/register`
returns 403 `LIMIT_EXCEEDED` (`extensions.category: "seats"`). The env limits `USERS_APP_ACCESS_LIMIT` and
`USERS_API_ACCESS_LIMIT` (default unlimited) also count members if you set them.

**Recommended:** one `Customer` (or `Member`) role with a policy that has App Access off, holding only the member
permissions. Building that policy: `directus-access-control`. On core, permissions can't have item rules, so "members
only see their own orders" needs a license. The Studio's recommended "update own user" permission is the exception that
works on core.

## Public registration

Settings (the **User Registration** section of project settings, or `PATCH /settings` as admin):

| Field | Default | Effect |
| --- | --- | --- |
| `public_registration` | `false` | Off: `/users/register` returns 403 `FORBIDDEN` |
| `public_registration_role` | `null` | Role given to every new user. `null` means no role: only the public policy |
| `public_registration_verify_email` | `true` | New users get status `unverified` and can't log in until verified |
| `public_registration_email_filter` | `null` | Filter on `email`, e.g. `{"_and":[{"email":{"_ends_with":"@acme.com"}}]}`; no match returns 403 |

```bash
curl -X POST "$DIRECTUS_URL/users/register" -H 'Content-Type: application/json' \
  -d '{"email":"jo@example.com","password":"...","first_name":"Jo","verification_url":"https://site.example.com/verify"}'
```

- Accepts only `email`, `password`, `first_name`, `last_name`, `verification_url`. Any other key (`role`, custom
  fields) fails with 400. Set extra profile fields after login.
- Success is 204 with no body. An already-registered email also gets 204, and nothing changes (unless that user is still `unverified` with verification on: the verification email is sent again). The docs say it always
  returns 204; it doesn't: registration off, an email filter miss, or a seat limit returns 403.
- Rate limited per IP: 5 requests per 60 s by default (`RATE_LIMITER_REGISTRATION_*`), failed attempts included. Over
  it: 429 `REQUESTS_EXCEEDED`. Plan for this in tests.
- `GET /server/info` (no token) returns `public_registration` and `public_registration_verify_email`, so a frontend can
  hide the signup form when it's off.

**Email verification.** The email links to `verification_url?token=...` (which must be listed in
`USER_REGISTER_URL_ALLOW_LIST`, or the request fails with 400) or, without one, to Directus itself. Your page reads
`token` and calls `GET /users/register/verify-email?token=<token>`. On success that **redirects (302) to
`/admin/users/<id>`**, a Studio page members can't use. Call it from your server or with `redirect: "manual"`, treat
the 302 as success, and show your own page. A bad token returns 403. Tokens last `EMAIL_VERIFICATION_TOKEN_TTL` (7d).

**Without working email** (default `EMAIL_TRANSPORT` is `sendmail`), the API still returns 204, logs "Could not send
email verification mail", and the user stays `unverified` forever. Configure email
(https://directus.com/docs/configuration/email) or turn verification off. An admin can also activate a user with
`PATCH /users/<id>` `{"status":"active"}`.

## Password reset

1. `POST /auth/password/request` with `{"email":"...","reset_url":"https://site.example.com/reset"}`. Always 204,
   even for unknown, inactive, or SSO users (no account enumeration). A `reset_url` not in
   `PASSWORD_RESET_URL_ALLOW_LIST` returns 400.
2. Your reset page reads `token` from the URL and calls `POST /auth/password/reset` with `{"token":"...","password":"..."}`.

Tokens last 1 day and stop working once the password changes. Same email caveat: no transport, no email, still 204.

## Invites

`POST /users/invite` with `{"email": "..." or [...], "role": "<role-uuid>", "invite_url": "..."}` creates the user with
status `invited` and emails a link. `invite_url` must be in `USER_INVITE_URL_ALLOW_LIST`. Your page then calls
`POST /users/invite/accept` with `{"token","password"}`. Token TTL: `USER_INVITE_TOKEN_TTL`.

- **A caller without permission gets 204 and nothing happens.** The endpoint swallows `FORBIDDEN`. Check
  `GET /users?filter[email][_eq]=...` afterwards.
- Invited users take no seat. On accept, if the role grants App Access and seats are full, the user is created with
  status `inactive-license` instead of `active`.
- Letting a non-admin role invite safely needs a licensed preset: see `directus-access-control` (recipes).

## Logging members in from a frontend

Login, refresh, and logout are in [auth-and-access.md](auth-and-access.md). Pick the mode by where the code runs:

| Frontend | Mode |
| --- | --- |
| Browser, same site as Directus | `session`: one httpOnly cookie, `credentials: "include"` on every request |
| Browser, different site | `cookie` (refresh token in httpOnly cookie) plus CORS and `REFRESH_TOKEN_COOKIE_*` setup |
| Server-rendered app (BFF, Next.js server) | `json` on the server; keep tokens in your own httpOnly session, never in JS |

**Recommended:** never put a refresh token in `localStorage`. SDK code for each mode: `directus-sdk`
(`references/setup-and-auth.md`).

A member with no `directus_users` read permission still gets `GET /users/me` back, but only `{ "id": ... }`. Grant
read on their own user (fields they need) to show a profile.

## Sources

- https://directus.com/docs/guides/auth/creating-users
- https://directus.com/docs/getting-started/authenticate-user
- https://directus.com/docs/configuration/security-limits
- https://directus.com/docs/configuration/email
- https://directus.com/docs/licensing/overview
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/users.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/users.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/controllers/auth.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/middleware/rate-limiter-registration.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/license/entitlements/lib/seats.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/utils/validate-user-count-integrity.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/telemetry/utils/check-user-limits.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/database/migrations/20240422A-public-registration.ts
- https://github.com/directus/directus/blob/v12.6.0/packages/env/src/constants/defaults.ts
