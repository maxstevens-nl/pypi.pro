import { domain } from "./stage";
import { zoneId } from "./zone";
import { searchScriptName } from "./api";
import { webScriptName } from "./site";
import { migrate } from "./migrate";
import { searchApi } from "./api";
import { web } from "./site";

new cloudflare.DnsRecord("ApexDns", {
  zoneId: zoneId!,
  name: domain,
  type: "A",
  content: "192.0.2.1",
  proxied: true,
  ttl: 1,
});

new cloudflare.DnsRecord("WwwDns", {
  zoneId: zoneId!,
  name: "www." + domain,
  type: "CNAME",
  content: domain,
  proxied: true,
  ttl: 1,
});

const searchRouteDeps = [migrate, searchApi.nodes.worker!];

new cloudflare.WorkersRoute(
  "SearchRoute-api",
  {
    zoneId: zoneId!,
    pattern: `${domain}/api/*`,
    script: searchScriptName,
  },
  { dependsOn: searchRouteDeps },
);

new cloudflare.WorkersRoute(
  "SearchRoute-api-www",
  {
    zoneId: zoneId!,
    pattern: `www.${domain}/api/*`,
    script: searchScriptName,
  },
  { dependsOn: searchRouteDeps },
);

new cloudflare.WorkersRoute(
  "SearchRoute-search",
  {
    zoneId: zoneId!,
    pattern: `${domain}/search/*`,
    script: searchScriptName,
  },
  { dependsOn: searchRouteDeps },
);

new cloudflare.WorkersRoute(
  "SearchRoute-search-exact",
  {
    zoneId: zoneId!,
    pattern: `${domain}/search`,
    script: searchScriptName,
  },
  { dependsOn: searchRouteDeps },
);

new cloudflare.WorkersRoute(
  "SearchRoute-search-www",
  {
    zoneId: zoneId!,
    pattern: `www.${domain}/search/*`,
    script: searchScriptName,
  },
  { dependsOn: searchRouteDeps },
);

new cloudflare.WorkersRoute(
  "SearchRoute-search-www-exact",
  {
    zoneId: zoneId!,
    pattern: `www.${domain}/search`,
    script: searchScriptName,
  },
  { dependsOn: searchRouteDeps },
);

// StaticSiteV2 doesn't deploy in dev, so we omit the routes
if (!$dev) {
  const webRouteDeps = [...searchRouteDeps, web.nodes.server!];

  new cloudflare.WorkersRoute(
    "WebRoute-apex",
    {
      zoneId: zoneId!,
      pattern: `${domain}/*`,
      script: webScriptName,
    },
    { dependsOn: webRouteDeps },
  );

  new cloudflare.WorkersRoute(
    "WebRoute-www",
    {
      zoneId: zoneId!,
      pattern: `www.${domain}/*`,
      script: webScriptName,
    },
    { dependsOn: webRouteDeps },
  );
}

export const outputs = {
  api: `https://${domain}`,
  site: $dev ? "http://localhost:5173" : `https://${domain}`,
};
