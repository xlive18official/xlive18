import { mkdir, copyFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const output = resolve(root, "dist");
const files = [
  "index.html",
  "styles.css",
  "app.js",
  "auth.js",
  "admin.js",
  "account-controls.js",
  "site-editor.js",
  "supabase-config.js",
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of files) {
  await copyFile(resolve(root, file), resolve(output, file));
}

console.log(`Prepared ${files.length} static files in dist/ for Cloudflare.`);
