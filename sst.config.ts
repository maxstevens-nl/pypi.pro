/// <reference path="./.sst/platform/config.d.ts" />

// const LOCAL_PROXY_HOST = "db.localtest.me";

// type SpawnResult = { exit: number; stdout: string; stderr: string };

// async function run(
//   cmd: string,
//   args: string[],
//   opts: { cwd?: string; capture?: boolean } = {},
// ): Promise<SpawnResult> {
//   const { spawn } = await import("node:child_process");
//   return new Promise((resolve, reject) => {
//     const child = spawn(cmd, args, {
//       cwd: opts.cwd,
//       stdio: opts.capture ? ["pipe", "pipe", "pipe"] : "inherit",
//       shell: process.platform === "win32",
//     });
//     let stdout = "";
//     let stderr = "";
//     if (opts.capture) {
//       child.stdout?.on("data", (d) => (stdout += d));
//       child.stderr?.on("data", (d) => (stderr += d));
//     }
//     child.on("error", reject);
//     child.on("exit", (exit) =>
//       resolve({ exit: exit ?? 0, stdout, stderr }),
//     );
//   });
// }

// async function ensureLocalPostgres() {
//   const url = process.env.DATABASE_URL;
//   if (!url) return;
//   let host: string;
//   try {
//     host = new URL(url).hostname;
//   } catch {
//     return;
//   }
//   if (host !== LOCAL_PROXY_HOST) return;
//
//   console.log("sst dev: starting local Postgres + Neon proxy via docker compose...");
//   const up = await run("docker", ["compose", "up", "-d", "--wait"]);
//   if (up.exit !== 0) {
//     throw new Error(
//       `docker compose up failed (exit ${up.exit}). Install Docker/OrbStack and retry.`
//     );
//   }
//   console.log("sst dev: local Postgres ready on :5432, Neon HTTP proxy on :4444");
//
//   if (await packagesTableEmpty()) {
//     console.log("sst dev: seeding from BigQuery (one-time)...");
//     const seed = await run("bun", ["scripts/seed-local.ts"], { cwd: process.cwd() });
//     if (seed.exit !== 0) {
//       throw new Error(
//         `db seed failed (exit ${seed.exit}). See logs above. You can retry with: bun run db:seed`
//       );
//     }
//   } else {
//     console.log("sst dev: packages table already seeded, skipping.");
//   }
// }

// async function packagesTableEmpty(): Promise<boolean> {
//   const r = await run(
//     "psql",
//     [process.env.DATABASE_URL!, "-t", "-A", "-c", "SELECT count(*) FROM packages"],
//     { capture: true },
//   );
//   if (r.exit !== 0) return true;
//   const n = parseInt(r.stdout.trim(), 10);
//   return Number.isNaN(n) || n === 0;
// }

const DOMAIN = "pypi.pro";

export default $config({
  app() {
    return { name: "pypi-pro", home: "cloudflare" };
  },
  async run() {
    // if ($dev) await ensureLocalPostgres();

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL is not set. Copy .env.example to .env and pick either the local dev URL or a Neon connection string.",
      );
    }

    // Pattern from https://github.com/anomalyco/sst/issues/6846
    let apiUrl: pulumi.Input<string>;
    if ($dev) {
      const dev = new sst.x.DevCommand("SearchDev", {
        dev: {
          command: "bun run dev:api",
          directory: ".",
          autostart: true,
        },
        environment: { DATABASE_URL: databaseUrl },
      });
      apiUrl = dev.url ?? "http://localhost:8787";
    } else {
      const pgUrl = new URL(databaseUrl);
      const hyperdrive = new sst.cloudflare.Hyperdrive("Database", {
        origin: {
          scheme: "postgres",
          host: pgUrl.hostname,
          port: pgUrl.port ? Number(pgUrl.port) : 5432,
          user: decodeURIComponent(pgUrl.username),
          password: decodeURIComponent(pgUrl.password),
          database: pgUrl.pathname.replace(/^\//, ""),
        },

        // TODO: remove
        caching: false,
      });

      const api = new sst.cloudflare.Worker("Search", {
        handler: "src/worker.ts",
        url: true,
        link: [hyperdrive],
        environment: { DATABASE_URL: databaseUrl },
        compatibility: { date: "2026-06-01", flags: ["nodejs_compat"] },
        transform: {
          worker: {
            observability: { enabled: true },
          },
        },
      });

      const zone = cloudflare.getZoneOutput({ filter: { name: DOMAIN } });
      new cloudflare.WorkersRoute("SearchRoute-api", {
        zoneId: zone.zoneId,
        pattern: `${DOMAIN}/api/*`,
        script: api.nodes.worker.scriptName,
      });

      apiUrl = ""; // same-origin: pypi.pro/api/* hits the Worker via WorkersRoute
    }

    const web = new sst.cloudflare.StaticSiteV2("Web", {
      path: "packages/web",
      build: {
        command: "bun run build",
        output: "dist",
      },
      environment: {
        VITE_API_URL: apiUrl,
      },
      notFound: "single-page-application",
      domain: DOMAIN,
      dev: {
        command: "bun run dev",
        directory: "packages/web",
        url: "http://localhost:5173",
      },
    });

    return {
      web: web.url,
      api: apiUrl,
    };
  },
});
