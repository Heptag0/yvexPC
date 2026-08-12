import { defineConfig } from "vite";
import obfuscatorPlugin from "vite-plugin-javascript-obfuscator";

// Configuración de Vite para Tauri.
// Docs: https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  // Vite sirve desde la raíz del proyecto; index.html vive en la raíz.
  clearScreen: false, // no borrar los logs de Rust al recargar
  server: {
    port: 1420,
    strictPort: true, // si 1420 está ocupado, falla en vez de cambiar de puerto
    watch: {
      // No vigilar la carpeta de Rust; Cargo se encarga de ella.
      ignored: ["**/src-tauri/**"],
    },
  },
  plugins: [
    // Ofusca el JS del build de producción (nunca en `tauri dev` — apply:
    // "build" hace que solo actúe con `vite build`, jamás con el servidor
    // de desarrollo). El código sigue siendo JS válido, pero ilegible a
    // simple vista: nombres de variables sin sentido, flujo reordenado, y
    // strings codificados. No es indestructible (nada de JS lo es), pero
    // sube la barrera de "abrir DevTools y leer" a "ingeniería inversa real".
    obfuscatorPlugin({
      apply: "build",
      options: {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.4,
        // false a propósito: en true, abrir DevTools congela el programa —
        // útil como defensa extra, pero también te estorbaría a TI si algún
        // día necesitas diagnosticar un bug en un .exe ya instalado en la
        // PC de un cliente. Actívalo más adelante si quieres esa capa extra.
        debugProtection: false,
        disableConsoleOutput: false,
        identifierNamesGenerator: "hexadecimal",
        // false a propósito: Tauri inyecta sus propios globals
        // (window.__TAURI__ y similares vía withGlobalTauri). Renombrar
        // identificadores globales podría romper esa integración.
        renameGlobals: false,
        // ⚠️ DIAGNÓSTICO EN CURSO: apagado temporalmente (estaba en true).
        // selfDefending rompe el código a propósito si detecta que fue
        // "modificado" — es una causa conocida de pantallas en blanco con
        // bundlers de módulos como Vite. Probando si esto es la causa del
        // bug de pantalla negra en producción antes de sospechar de la CSP.
        selfDefending: false,
        stringArray: true,
        stringArrayEncoding: ["base64"],
        stringArrayThreshold: 0.75,
        splitStrings: true,
        splitStringsChunkLength: 8,
      },
    }),
  ],
  // Salida del build de producción.
  build: {
    // Tauri usa Chromium/WebView2 en Windows; un target moderno está bien.
    target: "es2021",
    minify: process.env.TAURI_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_DEBUG,
    outDir: "dist",
  },
});