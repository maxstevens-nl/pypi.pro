import { hyperdrive } from "./database";
import { domain } from "./stage";
import { migrate } from "./migrate";

const searchApi = new sst.cloudflare.Worker("Search", {
  handler: "src/worker.ts",
  url: true,
  domain: $dev ? domain : undefined,
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

const zoneName = domain.split(".").slice(-2).join(".");
const zone = cloudflare.getZoneOutput({ filter: { name: zoneName } });
export const route = new cloudflare.WorkersRoute(
  "SearchRoute-api",
  {
    zoneId: zone.zoneId,
    pattern: `${domain}/api/*`,
    script: searchApi.nodes.worker.scriptName,
  },
  { dependsOn: [migrate, searchApi.nodes.worker] },
);
