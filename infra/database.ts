const original = sst.cloudflare.D1.prototype.getSSTLink;
sst.Linkable.wrap(sst.cloudflare.D1, (d1) => {
  const base = original.call(d1);
  return {
    ...base,
    properties: {
      ...base.properties,
      accountId: process.env.CLOUDFLARE_DEFAULT_ACCOUNT_ID,
      databaseId: d1.databaseId,
      token: process.env.CLOUDFLARE_API_TOKEN,
    },
  };
});

export const database = new sst.cloudflare.D1("Database");
