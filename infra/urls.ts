import { domain } from "./stage";

export const urls = new sst.Linkable("Urls", {
  properties: {
    api: `https://${domain}`,
    site: $dev ? "http://localhost:5173" : "https://" + domain,
  },
});

export const outputs = urls.properties;
