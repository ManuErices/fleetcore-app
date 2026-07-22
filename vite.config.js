import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api-generardocumento": {
        target: "https://southamerica-west1-mpf-maquinaria.cloudfunctions.net/generarDocumento",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-generardocumento/, ""),
      },
      "/api-generarlayout": {
        target: "https://southamerica-west1-mpf-maquinaria.cloudfunctions.net/generarLayout",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-generarlayout/, ""),
      },
      "/api-exportarword": {
        target: "https://southamerica-west1-mpf-maquinaria.cloudfunctions.net/exportarWord",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-exportarword/, ""),
      },
    },
  },
});
