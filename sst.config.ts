/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app() {
    return { name: "pypi-search", home: "cloudflare" };
  },
  async run() {
    const snapshots = new sst.cloudflare.Bucket("Snapshots");
    const ingest = new sst.cloudflare.Queue("Ingest");

    const worker = new sst.cloudflare.Worker("Search", {
      handler: "src/worker.ts",
      url: true,
      domain: "pypi.pro",
      link: [snapshots, ingest],
      compatibility: { date: "2026-06-01", flags: ["nodejs_compat"] },
      migrations: [
        { tag: "v1", newSqliteClasses: ["SearchIndex"] },
      ],
      transform: {
        worker: (args) => {
          args.bindings = $resolve([args.bindings]).apply(([b]) => [
            ...(b ?? []),
            { type: "durable_object_namespace", name: "SEARCH_INDEX", className: "SearchIndex" },
          ]);
          args.assets = {
            directory: "/root/pypipro/packages/web/dist",
          };
          args.cache = { enabled: true };
        },
      },
    });

    ingest.subscribe({ handler: "src/consumer.ts", link: [worker] });

    new sst.cloudflare.Cron("Sync", {
      job: { handler: "src/cron.ts", link: [ingest, snapshots] },
      schedules: ["0 3 * * *"],
    });

    new sst.cloudflare.Cron("Downloads", {
      job: { handler: "src/cron.ts", link: [ingest, snapshots], environment: { MODE: "downloads" } },
      schedules: ["0 4 * * 1"],
    });

    return { api: worker.url };
  },
});
