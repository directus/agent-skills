Write `server.mjs` in the current directory: the backend for our ticket portal's frontend, using `@directus/sdk` (install it here with npm) and Node's built-in `http` module, no framework. It reads `PORT` and `DIRECTUS_URL` from the environment.

- `POST /login` with a JSON body `{ "email", "password" }` logs the user in to Directus and starts a session for the browser. Answer 204, or 401 when the login fails.
- `GET /tickets` answers `{ "tickets": ["<title>", ...] }`: the titles of the tickets that user can read in Directus, as that user. 401 without a session.
- `POST /logout` ends the session, in Directus too. 204.

The browser must only ever get our own opaque session id in an httpOnly cookie, never a Directus token. Many users are logged in at once, and the frontend fires several requests in parallel. Directus access tokens are short-lived (5 seconds on this instance); a session must keep working until the user logs out. Test it with alice@example.com / alice-password-123 and bob@example.com / bob-password-123.
