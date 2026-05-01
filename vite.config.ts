import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
  },
  server: {
    host: "127.0.0.1",
    port: 8080,
    cors: { origin: "http://localhost:3001" },
  },
});
