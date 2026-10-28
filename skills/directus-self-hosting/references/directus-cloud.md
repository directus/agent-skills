# Directus Cloud

Directus Cloud runs and maintains the instance. Most of this skill (compose, volumes, Redis, scaling, dumps) doesn't
apply. What's different:

| Topic | On Cloud |
| --- | --- |
| Env vars | Set a preset list in the Cloud dashboard: `FILES_MAX_UPLOAD_SIZE`, the `CORS_*` vars, `PASSWORD_RESET_URL_ALLOW_LIST`, `USER_INVITE_URL_ALLOW_LIST`, `USER_REGISTER_URL_ALLOW_LIST`. Saving redeploys the project. Anything else: Enterprise, through support. |
| Upgrades | Automatic rolling updates to the latest version. Version locking is Enterprise only. Callers (SDK, frontends, flows) still need the `directus-upgrade` review when the version moves. |
| Backups | Database and file assets backed up daily on all projects. Restores go through Directus support. Keep your own exports of anything you can't afford to wait on. |
| Extensions | Marketplace: app extensions and sandboxed API extensions. Custom extensions only on Enterprise, enabled by support ticket and deployed by pushing to a Directus-provided GitHub repository. |
| Database access | No direct database connection, except Enterprise "Direct DB" by support ticket. `pg_dump`-style backups and SQL fixes aren't available otherwise. |
| Domain | `<project>.directus.app`. Custom domains are Enterprise, through support. |
| Scaling | Handled by Cloud. Usage (API requests, bandwidth, storage, database entries, seats) shows on the project's monitoring page; limits per tier are in the Cloud policies. |

Consequences for agents:

- Don't suggest env changes outside the preset list, shell commands, `node /directus/cli.js`, or Docker steps for a
  Cloud project. Use the API, the Studio, flows, and Marketplace extensions.
- A hook or endpoint extension is an Enterprise-only answer on Cloud. Prefer a flow (`directus-flows`).
- Moving between Cloud and self-hosted: schema and configuration with `directus-environment-sync`; content and files
  need a separate export/import, or a database copy where you have access.

## Sources

- https://directus.com/docs/cloud/getting-started/introduction
- https://directus.com/docs/cloud/configuration/environment-variables
- https://directus.com/docs/cloud/projects/version-upgrades
- https://directus.com/docs/cloud/projects/backups
- https://directus.com/docs/cloud/configuration/custom-extensions
- https://directus.com/docs/cloud/configuration/direct-database-access
- https://directus.com/docs/cloud/configuration/custom-domains
- https://directus.com/docs/cloud/projects/monitoring
- https://directus.com/docs/self-hosting/including-extensions
