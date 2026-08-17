import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/auth": "http://localhost:4100",
      "/api": "http://localhost:4100",
    },
  },
  build: {
    outDir: "../backend/public",
    emptyOutDir: true,
  },
});
