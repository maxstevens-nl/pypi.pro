const root = "./dist";

Bun.serve({
  async fetch(req) {
    const path = new URL(req.url).pathname;
    const file = Bun.file(root + path);
    return (await file.exists())
      ? new Response(file)
      : new Response(Bun.file(root + "/index.html"));
  },
  port: 3000,
});
