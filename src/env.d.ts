interface Env {
  DATABASE_URL: string;
  ASSETS?: Fetcher;
  MODE?: string;
  INGEST: Queue<unknown>;
}