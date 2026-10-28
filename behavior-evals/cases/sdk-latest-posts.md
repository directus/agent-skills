Write a Node script `latest-posts.mjs` in the current directory that uses `@directus/sdk` (install it here with npm). It reads the instance URL and token from the `DIRECTUS_URL` and `DIRECTUS_TOKEN` environment variables and prints one JSON object to stdout:

`{ "total": <number of published posts>, "posts": [{ "title": "...", "slug": "...", "author": "<the author's name>" }] }`

`posts` holds the 2 most recently published posts (by `date_published`), newest first. Run it to check it works.
