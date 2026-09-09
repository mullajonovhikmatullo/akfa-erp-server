require("dotenv/config");

const { spawnSync } = require("node:child_process");

const configuredDatabaseUrl = process.env.MIGRATION_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!configuredDatabaseUrl) {
    console.error("DATABASE_URL or MIGRATION_DATABASE_URL is required");
    process.exit(1);
}

let migrationUrl;
try {
    migrationUrl = new URL(configuredDatabaseUrl);
} catch {
    console.error("Configured migration database URL is invalid");
    process.exit(1);
}

if (!process.env.MIGRATION_DATABASE_URL && !process.env.DIRECT_URL && migrationUrl.hostname.includes("-pooler")) {
    migrationUrl.hostname = migrationUrl.hostname.replace("-pooler", "");
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: migrationUrl.toString() },
    stdio: "inherit",
});

if (result.error) {
    console.error(result.error.message);
    process.exit(1);
}

process.exit(result.status ?? 1);
