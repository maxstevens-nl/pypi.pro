import { ingest } from "./search";
import { getDb } from "./db";

export default {
  async queue(batch: MessageBatch, env: Env) {
    const db = getDb(env);
    for (const msg of batch.messages) {
      try {
        await ingest(db, msg.body as any[]);
        msg.ack();
      } catch (error) {
        console.error("Failed to ingest message:", error);
        msg.retry();
      }
    }
  },
};
