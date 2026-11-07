import { build } from "esbuild";

await build({
  entryPoints: ["src/web/app.ts"], bundle: true, format: "esm", platform: "browser",
  target: "es2022", outfile: "dist/browser/web/app.js", sourcemap: true, logLevel: "warning",
  define: { SHIFTMGMT_DEVELOPMENT_PREVIEW: process.env.SHIFTMGMT_DEVELOPMENT_PREVIEW === "1" ? "true" : "false" }
});
