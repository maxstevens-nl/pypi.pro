import { ingest } from "./search";
import { getDb } from "./db";
import type { PackageRecord } from "./types";

export default {
  async queue(batch: MessageBatch<PackageRecord[]>, env: Env) {
    const db = getDb(env);
    for (const msg of batch.messages) {
      try {
        await ingest(db, msg.body);
        msg.ack();
      } catch (error) {
        console.error("Failed to ingest message:", error);
        msg.retry();
      }
    }
  },
};
