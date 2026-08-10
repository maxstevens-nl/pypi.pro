import { database } from "./database";
import { migrate } from "./migrate";

export const searchApi = new sst.cloudflare.Worker(
  "Search",
  {
    handler: "packages/api/worker.ts",
    url: true,
    link: [database],
    compatibility: { date: "2026-06-01", flags: ["nodejs_compat"] },
    placement: {
      region: "aws:eu-central-1",
    },
    transform: {
      worker: {
        observability: { enabled: true },
      },
    },
  },
  { dependsOn: [migrate] },
);
export const searchScriptName = searchApi.nodes.worker.scriptName;

const gcpKey = new sst.Secret("GcpServiceAccountKey");
const gcpConfig = new sst.Linkable("GcpConfig", {
  properties: {
    project: process.env.GOOGLE_PROJECT!,
  },
});

new sst.cloudflare.Cron(
  "DailyRefresh",
  {
    schedules: ["0 7 * * *"],
    worker: {
      handler: "packages/api/cron.ts",
      link: [database, gcpKey, gcpConfig],
      compatibility: { date: "2026-06-01", flags: ["nodejs_compat"] },
    },
  },
  { dependsOn: [migrate] },
);
