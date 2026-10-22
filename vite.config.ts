import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  server: {
    // The Cloudflare Vite plugin reads the port from here — passing `--port`
    // on the command line leaves the worker runner pointed at the wrong port
    // and every request fails with "Parent environment not initialized".
    port: Number(process.env.PORT ?? 5173),
    strictPort: true,
  },
});
