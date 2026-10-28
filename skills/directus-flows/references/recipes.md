# Recipes

## Flow or extension?

**Recommended:** flows are glue: notifications, outbound webhooks, small transforms, and composing utility flows. Write
a hook or endpoint (`directus-extensions` skill) once the logic branches heavily, needs npm packages, needs tests, or
runs on every write of a busy collection.

| Situation | Use |
| --- | --- |
| Editors need to see and tweak the automation | Flow |
| Directus Cloud below Enterprise | Flow, plus sandboxed Marketplace operations |
| More than ~10 operations, or nested loops | Hook or endpoint |
| Needs a library (Stripe SDK, PDF generation) | Operation extension, called from a flow, or a hook |
| Must be unit tested or code reviewed | Hook or endpoint |
| Core tier and already at the active-flow limit | Merge flows, or a hook (extensions don't count) |

## Slug on create

Event `filter`, scope `items.create`, collections `["posts"]`, `return: "slug"`. One Run Script, key `slug`:

```js
module.exports = async function (data) {
	const p = data.$trigger.payload;
	if (p.slug) return p;
	const slug = String(p.title ?? '')
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
	return { ...p, slug };
};
```

A field default or the `input` interface's `slug` option covers this without a flow when editors type the title in the
Studio.

## Notify on publish

Event `action`, scope `items.update`, collections `["posts"]`:

1. `condition` key `became_published`: `{"$trigger": {"payload": {"status": {"_eq": "published"}}}}`. Passes only when
   this update set `status` to `published`. Re-saving an already published post with `status` in the payload passes
   again; if one email per post matters, add a `published_notified_at` field, filter on it being null below, and set
   it after the mail.
2. `item-read` key `posts` with no `key` and
   `query: {"filter": {"id": {"_in": "{{ $trigger.keys }}"}}, "fields": ["id", "title", "author.email"]}`,
   `permissions: "$full"`. A query read always returns an array, whether the update touched one post or many
   (a `key` read returns an object for one key).
3. `trigger` a `Utils → Send Email` utility with `payload: "{{ posts }}"`: one run per post
   ([utility-flows-and-loops.md](utility-flows-and-loops.md#loops)). Inside it, `to: ["{{ $trigger.author.email }}"]`.

## Form submission emails

The CMS starter's "Form Submissions → Email Notifications": event `action` on `form_submissions` `items.create`, then
read the form with its email settings (`$full`), shape the data in Run Script, render with the Liquid operation, check a
`to` exists, send with `mail`. Split the render and send steps into utilities once a second flow needs them (see
[utility-flows-and-loops.md](utility-flows-and-loops.md#common-utilities)).

## Redirect when a URL changes

From the CMS starter's "Redirects" flow: event `filter` on `items.update` for `pages` and `posts`, `return: null` (so the
payload passes through unchanged).

1. `condition`: the payload has a new `slug` or `permalink` (`_or` of two `_nnull` rules).
2. `item-read` the current item with `$trigger` permissions.
3. `condition`: the stored item is `published`.
4. Run Script builds `{ url_from, url_to, response_code: "301" }`, or returns `null` if nothing changed.
5. `condition` the script result is not null, then `item-create` in `redirects`.

It's a filter so it can read the old URL before the write lands. Each "no" branch ends on a `log` operation so the
editor's save isn't cancelled.

## Nightly job

`schedule` with `"0 0 2 * * *"` (02:00 server time; 6 fields, seconds first). `item-read` with a filter like
`{"date_created": {"_lt": "$NOW(-30 days)"}}`, then act on the result (loop through a utility if each item needs its own
step). A schedule has no user, so `$trigger` permissions check nothing. Say which items it touches before activating it.

## Protected webhook

Webhook URLs are public. Check a shared secret before doing anything:

1. Webhook trigger, `method: "POST"`, `error_on_reject: true`.
2. `condition`: `{"$trigger": {"headers": {"x-webhook-secret": {"_eq": "{{ $env.WEBHOOK_SECRET }}"}}}}` with
   `WEBHOOK_SECRET` in `FLOWS_ENV_ALLOW_LIST`. Header names arrive lowercase.
3. Reject branch: `throw-error` with `status: "401"`.

Treat `$trigger.body` as untrusted input, especially before a `$full` write.

## Sources

- https://directus.com/docs/guides/flows
- https://github.com/directus-labs/starters/blob/main/cms/directus/template/src/flows.json
- https://github.com/directus-labs/starters/blob/main/cms/directus/template/src/operations.json
- https://github.com/directus/directus/blob/v12.6.0/api/src/flows.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/operations/condition/index.ts
