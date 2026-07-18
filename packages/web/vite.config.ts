import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
  },
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify(process.env.VITE_API_URL ?? ""),
  },
});
