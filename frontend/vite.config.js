import process from "node:process";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/



export default defineConfig({
  plugins: [react(), tailwindcss(), basicSsl()],

  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    https: process.env.HTTPS === "true" ? true : undefined,

    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",

        changeOrigin: true,

        configure: (proxy) => {
          proxy.on("error", (err, req, res) => {
            if (res && !res.headersSent && res.writeHead) {
              res.writeHead(503, { "Content-Type": "application/json" });

              res.end(
                JSON.stringify({
                  success: false,
                  message: "Backend belum aktif di port 5000",
                }),
              );
            }
          });
        },
      },

      "/uploads": {
        target: "http://127.0.0.1:5000",

        changeOrigin: true,

        configure: (proxy) => {
          proxy.on("error", (err, req, res) => {
            if (res && !res.headersSent && res.writeHead) {
              res.writeHead(404);

              res.end();
            }
          });
        },
      },
    },
  },
});
