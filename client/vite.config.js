import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/auth":     { target: "http://localhost:4000", changeOrigin: true },
      "/channels": { target: "http://localhost:4000", changeOrigin: true },
      "/users":    { target: "http://localhost:4000", changeOrigin: true },
      "/upload":   { target: "http://localhost:4000", changeOrigin: true },
      "/uploads":  { target: "http://localhost:4000", changeOrigin: true },
      "/health":   { target: "http://localhost:4000", changeOrigin: true },
      "/messages": { target: "http://localhost:4000", changeOrigin: true },
      "/socket.io": {
        target: "http://localhost:4000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
