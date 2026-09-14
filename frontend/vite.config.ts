import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// EthioHire — React SPA (Vite).
// Dev server owns port 3000 (the sandbox gateway proxies to it) and forwards
// /api/* to the Django REST Framework backend on 127.0.0.1:8000, so the app
// can keep using same-origin relative API paths + cookies.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    headers: {
      // Firebase signInWithPopup requires the opener page to share its
      // browsing context group with the auth popup. Without this header
      // Chrome isolates the popup and the SDK's window.closed polling
      // spams "Cross-Origin-Opener-Policy policy would block the
      // window.closed call" — which can stall the sign-in flow.
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: false,
      },
    },
  },
});
