import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    // runtimeErrorOverlay(), // Temporarily disabled to reduce noise
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
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
    // Configure HMR for ngrok tunneling in development
    // When behind ngrok, use the public host for HMR connection
    hmr: process.env.PUBLIC_WEBSOCKET_URL 
      ? {
          protocol: 'wss',
          host: process.env.PUBLIC_WEBSOCKET_URL.replace('wss://', '').replace('/voice-dialer', ''),
          port: 443,
          timeout: 60000,
        }
      : false,
  },
});
