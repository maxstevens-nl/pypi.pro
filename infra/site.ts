import { domain } from "./stage";
import { urls } from "./urls";

export const web = new sst.cloudflare.StaticSiteV2("Web", {
  path: "packages/web",
  build: {
    command: "bun run build",
    output: "dist",
  },
  notFound: "single-page-application",
  domain,
  environment: {
    VITE_API_URL: urls.properties.api,
  },
  dev: {
    command: "bun run dev",
    directory: "packages/web",
    url: "http://localhost:5173",
  },
});
