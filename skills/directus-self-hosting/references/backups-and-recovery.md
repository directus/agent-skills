# Backups and recovery

- [What to back up](#what-to-back-up)
- [What is not a backup](#what-is-not-a-backup)
- [Database dumps](#database-dumps)
- [Files](#files)
- [Restoring](#restoring)

## What to back up

| Piece | Why | Where |
| --- | --- | --- |
| **Database** | Everything Directus knows: content, users, roles, policies, permissions, flows, settings, file metadata, revisions | Postgres/MySQL/etc., or the SQLite file |
| **File storage** | The database only holds file rows; the bytes live in storage | `/directus/uploads` volume, or the bucket |
| **`SECRET` and the env** | Without the same `SECRET`, encrypted settings (AI keys, license) decrypt to `null` after a restore | Secret manager, not only the server |
| **Extensions** | Custom builds, and Marketplace installs in `extensions/.registry/` | Git and the image for your own; the folder or volume |
| Email templates, custom migrations | Files Directus reads from disk | `/directus/templates`, `MIGRATIONS_PATH` |

Redis needs no backup: it holds caches, locks, and messages that Directus rebuilds.

**House rule:** dump the database and copy the files at the same time, keep several days of history off the server,
and test a restore before you need one.

## What is not a backup

- **A schema snapshot** (`directus schema snapshot`, `GET /schema/snapshot`) holds collections, fields, and relations.
  No items, users, roles, permissions, flows, settings, or files.
- **Environment Sync files** (`d6s sync pull`) hold schema and configuration, never content items or files. Both are
  for promoting changes between instances (`directus-environment-sync`), not recovery.
- A volume snapshot of a running database's data directory may not be consistent. Prefer the database's own dump or
  the provider's snapshots.

## Database dumps

Postgres in the compose stack (verified round trip on 12.5.1):

```bash
# Backup (Directus can keep running)
docker compose exec -T database pg_dump -U directus -Fc directus > directus-$(date +%F).dump

# Restore: stop Directus first so nothing writes mid-restore
docker compose stop directus
docker compose exec -T database pg_restore -U directus -d directus --clean --if-exists --no-owner < directus-<date>.dump
docker compose start directus
```

MySQL / MariaDB:

```bash
docker compose exec -T database mysqldump --single-transaction -u directus -p"$DB_PASSWORD" directus > directus.sql
docker compose exec -T database mysql -u directus -p"$DB_PASSWORD" directus < directus.sql
```

SQLite: stop the container, copy the `DB_FILENAME` file (plus any `-wal` / `-shm` files next to it), start again.

Managed databases (RDS, Cloud SQL, Neon, Supabase, DigitalOcean): turn on the provider's automated backups and
point-in-time recovery, and still take a periodic logical dump you control.

## Files

- **S3 and other buckets:** turn on bucket versioning or replication. Deleting a file in Directus deletes the object.
- **Local volume:** archive the named volume (compose prefixes it with the project name):

```bash
docker run --rm -v <project>_uploads:/data:ro -v "$PWD":/backup alpine tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

## Restoring

1. **Use the same image tag the backup came from.** A newer tag migrates the restored database forward on boot (an
   upgrade; read `directus-upgrade`). An older tag than the database is worse: Directus only checks that its own
   migrations ran, so it starts against a schema it doesn't know without complaint. That's also why rolling back an
   upgrade means restoring the pre-upgrade dump, not just the old tag.
2. **Same `SECRET` as the source.** Otherwise re-enter AI provider keys and the license, and everyone logs in again.
3. Restore the database, then the files, with Directus stopped. Start one instance, check the logs, then scale out.
4. Same storage location names (`STORAGE_LOCATIONS`) as the source: each `directus_files` row points at a location by
   name.
5. Clear caches after a restore with Redis: `node /directus/cli.js cache clear`, or restart everything.
6. Verify: admin login, a non-admin login, a content read, an `/assets/<id>` request, one flow run.

Restoring into a **different** instance (copying prod to staging): the copy brings prod users, tokens, flows (which may
email or call webhooks), and settings such as `project_url`. Disable or edit those before you start the copy's flows.

## Sources

- https://directus.com/docs/self-hosting/deploying
- https://directus.com/docs/self-hosting/requirements
- https://directus.com/docs/configuration/files
- https://github.com/directus/directus/blob/v12.6.0/packages/types/src/snapshot.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/database/index.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/payload.ts
- https://github.com/directus/directus/blob/v12.6.0/api/src/services/files.ts
- Live 12.5.1 + Postgres 17 compose stack (`pg_dump -Fc` / `pg_restore --clean --if-exists --no-owner` round trip)
