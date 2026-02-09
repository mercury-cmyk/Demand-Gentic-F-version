import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    // runtimeErrorOverlay(), // Temporarily disabled to reduce noise
    {
      name: "disable-vite-client",
      enforce: "post",
      transformIndexHtml(html) {
        // Remove Vite client injection to prevent websocket attempts in dev.
        // Handles relative and absolute URLs (e.g. when behind a tunnel/proxy).
        return html
          .replace(
            /<script\b[^>]*src=(["'])[^"']*\/\@vite\/client\1[^>]*>\s*<\/script>/gi,
            "",
          )
          .replace(
            /<script\b[^>]*>\s*import\s+(["'])[^"']*\/\@vite\/client\1;?\s*<\/script>/gi,
            "",
          )
          .replace(
            /<script\b[^>]*>\s*import\(\s*(["'])[^"']*\/\@vite\/client\1\s*\)\s*;?\s*<\/script>/gi,
            "",
          )
          .replace(/\/\@vite\/client\b/gi, "/__vite_client_disabled__");
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 5000,
    strictPort: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    watch: {
      // Ignore unnecessary file changes to prevent constant reloads
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/*.log',
        '**/.env*',
        '**/README*.md',
        '**/PHASE*.md',
        '**/docs/**',
        '**/attached_assets/**',
        '**/*.sql',
        '**/storage/**',
        '**/*.db'
      ],
      // Reduce polling frequency
      usePolling: false,
      interval: 1000,
    },
    // Disable HMR - WebSocket frames getting corrupted
    hmr: false,
    // Disable Vite websocket server entirely
    ws: false,
  },
});
