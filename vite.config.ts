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
    host: "0.0.0.0",
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
    // Configure HMR — only override port for ngrok/tunnel usage
    // In production builds, Vite HMR client is not included at all.
    // In local dev without tunnel, use default settings (auto-detect).
    hmr: process.env.USE_TUNNEL === 'true' || process.env.NGROK_AUTHTOKEN
      ? { clientPort: 443 }
      : true,
  },
});
