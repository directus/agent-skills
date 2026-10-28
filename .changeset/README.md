# Changesets

Every PR that changes what an agent sees (a skill, a reference, a description, the plugin or MCP config) adds a
changeset: `npm run changeset`, pick the bump, and write one or two sentences for the changelog.

| Bump    | When                                                                                     |
| ------- | ---------------------------------------------------------------------------------------- |
| `patch` | Fixes and tightening inside existing skills: a wrong fact, a clearer trap, a better link |
| `minor` | A new skill or reference, a new recommendation, or support for a new Directus release         |
| `major` | A skill renamed or removed, or a recommendation reversed                                     |

Merging to `main` opens a "Version skills" PR that bumps the version, writes `CHANGELOG.md`, and syncs the plugin
manifests. Merging that PR tags the release.
