import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// The Docker dev container bind-mounts the source and runs `vite` on port 5173
// (exposed as 30100). File-system events don't propagate reliably into the
// container on macOS, so fall back to polling there.
export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: 5173,
    watch: { usePolling: true },
  },
});
