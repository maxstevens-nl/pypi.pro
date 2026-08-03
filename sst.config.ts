/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "pypi-pro",
      removal: input?.stage === "prod" ? "retain" : "remove",
      home: "cloudflare",
      providers: { neon: "0.13.0" },
    };
  },
  async run() {
    const fs = await import("fs");
    const outputs = {};
    for (const value of fs.readdirSync("./infra/")) {
      const result = await import("./infra/" + value);
      if (result.outputs) Object.assign(outputs, result.outputs);
    }
    return outputs;
  },
});
