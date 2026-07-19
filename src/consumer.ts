import { ingest } from "./search";

export default {
  async queue(batch: MessageBatch, env: Env) {
    for (const msg of batch.messages) {
      try {
        await ingest(env.DB, msg.body);
        msg.ack();
      } catch (error) {
        console.error("Failed to ingest message:", error);
        msg.retry();
      }
    }
  },
};
