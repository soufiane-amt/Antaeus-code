import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const targets = [
  // Extension host (Node)
  {
    entryPoints: ["src/extension.ts"],
    outfile: "dist/extension.js",
    platform: "node",
    format: "cjs",
    target: "node20",
    external: ["vscode"],
  },
  // Chat UI (browser, inside the webview)
  {
    entryPoints: ["webview/main.ts"],
    outfile: "dist/webview.js",
    platform: "browser",
    format: "iife",
    target: "es2022",
  },
];

for (const options of targets) {
  const config = { bundle: true, sourcemap: true, logLevel: "info", ...options };
  if (watch) {
    await (await esbuild.context(config)).watch();
  } else {
    await esbuild.build(config);
  }
}
