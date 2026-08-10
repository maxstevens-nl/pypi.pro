import { drizzle } from "drizzle-orm/d1";
import { Resource } from "sst";
import { relations } from "../db/schema";

export const db = drizzle(Resource.Database, { relations });
export type Db = typeof db;
