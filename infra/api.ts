import { hyperdrive } from "./database";

export const searchApi = new sst.cloudflare.Worker("Search", {
  handler: "src/worker.ts",
  url: true,
  link: [hyperdrive],
  compatibility: { date: "2026-06-01", flags: ["nodejs_compat"] },
  placement: {
    region: "aws:eu-central-1",
  },
  transform: {
    worker: {
      observability: { enabled: true },
    },
  },
});

export const searchScriptName = searchApi.nodes.worker.scriptName;

const gcpKey = new sst.Secret("GcpServiceAccountKey");

const gcpConfig = new sst.Linkable("GcpConfig", {
  properties: {
    project: process.env.GOOGLE_PROJECT!,
  },
});

new sst.cloudflare.Cron("DailyRefresh", {
  schedules: ["0 7 * * *"],
  worker: {
    handler: "src/cron.ts",
    link: [hyperdrive, gcpKey, gcpConfig],
    compatibility: { date: "2026-06-01", flags: ["nodejs_compat"] },
  },
});
