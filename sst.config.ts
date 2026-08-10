/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "pypi-pro",
      removal: input?.stage === "prod" ? "retain" : "remove",
      home: "cloudflare",
    };
  },
  async run() {
    const { outputs } = await import("./infra/app");
    return outputs;
  },
});
