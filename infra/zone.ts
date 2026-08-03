import { domain } from "./stage";

const zoneName = domain.split(".").slice(-2).join(".");

const zone = cloudflare.getZoneOutput({ filter: { name: zoneName } });

export const zoneId = zone.zoneId;