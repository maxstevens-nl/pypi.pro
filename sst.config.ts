/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app() {
    return { name: "pypi-search", home: "cloudflare" };
  },
  async run() {
    const snapshots = new sst.cloudflare.Bucket("Snapshots");
    const ingest = new sst.cloudflare.Queue("Ingest");

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is not set. Add a Neon postgres connection string to .env");
    }

    const worker = new sst.cloudflare.Worker("Search", {
      handler: "src/worker.ts",
      url: true,
      domain: "pypi.pro",
      link: [snapshots, ingest],
      environment: { DATABASE_URL: databaseUrl },
      compatibility: { date: "2026-06-01", flags: ["nodejs_compat"] },
      transform: {
        worker: (args) => {
          args.assets = {
            directory: "/root/pypipro/packages/web/dist",
          };
          args.cache = { enabled: true };
        },
      },
    });

    ingest.subscribe({
      handler: "src/consumer.ts",
      link: [worker],
      environment: { DATABASE_URL: databaseUrl },
    });

    new sst.cloudflare.Cron("Sync", {
      job: { handler: "src/cron.ts", link: [ingest, snapshots], environment: { DATABASE_URL: databaseUrl } },
      schedules: ["0 3 * * *"],
    });

    new sst.cloudflare.Cron("Downloads", {
      job: {
        handler: "src/cron.ts",
        link: [ingest, snapshots],
        environment: { MODE: "downloads", DATABASE_URL: databaseUrl },
      },
      schedules: ["0 4 * * 1"],
    });

    return { api: worker.url };
  },
});