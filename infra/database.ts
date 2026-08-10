sst.Linkable.wrap(sst.cloudflare.D1, (d1) => ({
  properties: {
    accountId: process.env.CLOUDFLARE_DEFAULT_ACCOUNT_ID,
    databaseId: d1.databaseId,
    token: process.env.CLOUDFLARE_API_TOKEN,
  },
}));

export const database = new sst.cloudflare.D1("Database");
