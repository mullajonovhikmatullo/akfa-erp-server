# Backups

`deploy/backup.sh` runs nightly from cron (`deploy/erp-pos-backup.cron`) and on every backend deploy.

Each run:

1. `pg_dump -Fc` into `/srv/erp-pos/backups`, checked with `pg_restore --list` before it is kept.
2. Local media tarball and checksums. Local copies are kept `RETENTION_DAYS` (14).
3. When `BACKUP_R2_*` is set, off-site copy to a separate R2 bucket:
   - `postgres/` — the dump, media tarball and checksums, kept `BACKUP_REMOTE_RETENTION_DAYS` (30).
   - `images/` — mirror of the app image bucket (incremental).
   - `images-deleted/<run>/` — images removed or replaced in the app bucket since the previous run, kept 30 days.
4. Pings `BACKUP_HEARTBEAT_URL` on success, so a missed backup raises an alert.

`deploy/verify-backup.sh --remote` runs weekly: it downloads the newest off-site dump, restores it into a throwaway
`erp_pos_verify` database and prints row counts. Logs: `/srv/erp-pos/backups/backup.log`, `verify.log`.

## One-time setup

1. Cloudflare → R2 → create bucket `mavion-erp-backups` (private, no public access).
2. R2 → Manage API tokens → create token: **Object Read & Write**, scoped to `mavion-erp-backups` only.
   Do not reuse the app token: the app must not be able to touch backups.
3. Add `BACKUP_R2_BUCKET`, `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY` to `/srv/erp-pos/app/.env`.
4. As root: `install -m 644 deploy/erp-pos-backup.cron /etc/cron.d/erp-pos-backup`
5. Check: `sudo -u deploy ./deploy/backup.sh && sudo -u deploy ./deploy/verify-backup.sh --remote`

## Restore

Stop the backend first so nothing writes during the restore:

```bash
cd /srv/erp-pos/app
docker compose --env-file .env -f docker-compose.production.yml stop backend
./deploy/restore.sh /srv/erp-pos/backups/postgres-<timestamp>.dump
docker compose --env-file .env -f docker-compose.production.yml start backend
```

If the server itself is lost, fetch the dump from `mavion-erp-backups/postgres/` first and copy
`mavion-erp-backups/images/` back into the app bucket (`rclone copy`), see `deploy/rclone.sh` for the remote setup.
