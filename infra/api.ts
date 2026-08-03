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
      cacheOptions: { enabled: true },
    },
  },
});

export const searchScriptName = searchApi.nodes.worker.scriptName;