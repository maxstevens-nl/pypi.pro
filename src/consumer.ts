export default {
  async queue(batch: MessageBatch, env: Env) {
    const stub = env.SEARCH_INDEX.getByName("pypi");
    for (const msg of batch.messages) {
      await stub.fetch("https://do.local/ingest", {
        method: "POST",
        body: JSON.stringify({ records: msg.body }),
        headers: { "content-type": "application/json" },
      });
      msg.ack();
    }
  },
};
