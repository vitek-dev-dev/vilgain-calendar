import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// The Docker dev container bind-mounts the source and runs `vite` on port 5173
// (exposed as 30100). File-system events don't propagate reliably into the
// container on macOS, so fall back to polling there.
//
// GitHub Pages serves this repo from https://<user>.github.io/vilgain-calendar/,
// so the production build needs that prefix on every asset URL. Dev keeps
// serving from the root.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/vilgain-calendar/" : "/",
  plugins: [vue()],
  server: {
    host: true,
    port: 5173,
    watch: { usePolling: true },
  },
}));
