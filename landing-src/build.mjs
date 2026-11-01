import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const out = path.join(repo, "landing");
const tmp = path.join(here, ".build");
const release = JSON.parse(
  await fs.readFile(path.join(here, "release.json"), "utf8")
);

if (!release.bytes || release.bytes <= 0) {
  throw new Error("release.json has no artifact size");
}
if (!/^[a-f0-9]{64}$/.test(release.sha256)) {
  throw new Error("release.json has no valid SHA-256");
}
if (!release.siteUrl.startsWith("https://")) {
  throw new Error("release.json has no site URL");
}

const downloadUrl = `https://github.com/Sharjeelbaig/openFoundry/releases/download/${release.tag}/${release.asset}`;

await fs.rm(out, { recursive: true, force: true });
await fs.rm(tmp, { recursive: true, force: true });
await fs.mkdir(path.join(out, "assets", "screens"), { recursive: true });
await fs.mkdir(tmp, { recursive: true });

const common = {
  bundle: true,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
};

await build({
  ...common,
  entryPoints: [path.join(here, "client.tsx")],
  outfile: path.join(out, "assets", "app.js"),
  format: "esm",
  platform: "browser",
  target: ["chrome100", "firefox100", "safari15"],
  minify: true,
  legalComments: "eof",
});

await build({
  ...common,
  entryPoints: [path.join(here, "ssr.tsx")],
  outfile: path.join(tmp, "ssr.mjs"),
  format: "esm",
  platform: "node",
  target: "node20",
  packages: "external",
});

const moduleUrl =
  pathToFileURL(path.join(tmp, "ssr.mjs")).href + `?v=${Date.now()}`;
const { render } = await import(moduleUrl);
const { html, styles } = render();

const template = await fs.readFile(path.join(here, "template.html"), "utf8");
const replacements = {
  "{{HTML}}": html,
  "{{STYLES}}": styles,
  "{{SITE_URL}}": release.siteUrl,
  "{{VERSION}}": release.version,
  "{{DOWNLOAD_URL}}": downloadUrl,
  "{{SIZE_BYTES}}": String(release.bytes),
};
let page = template;
for (const [token, value] of Object.entries(replacements)) {
  page = page.split(token).join(value);
}

const missing = page.match(/\{\{[A-Z_]+\}\}/g);
if (missing) {
  throw new Error(`Unreplaced template tokens: ${[...new Set(missing)].join(", ")}`);
}
if (/[—–]/.test(page)) {
  throw new Error("The page copy contains an em or en dash");
}
if (/href="#"|TODO|lorem ipsum|coming soon/i.test(page)) {
  throw new Error("Placeholder marker found in the page");
}

await fs.writeFile(path.join(out, "index.html"), page);
await fs.copyFile(
  path.join(repo, "public", "brand", "openfoundry-icon.svg"),
  path.join(out, "assets", "openfoundry-icon.svg")
);
await fs.copyFile(path.join(here, "og.png"), path.join(out, "assets", "og.png"));

const screenFiles = (await fs.readdir(path.join(here, "screens"))).filter((file) =>
  file.endsWith(".webp")
);
for (const file of screenFiles) {
  await fs.copyFile(
    path.join(here, "screens", file),
    path.join(out, "assets", "screens", file)
  );
}

const refs = [...page.matchAll(/(?:src|href)="\.\/assets\/([^"]+)"/g)].map(
  (match) => match[1]
);
for (const ref of new Set(refs)) {
  await fs.access(path.join(out, "assets", ref));
}

const size = (await fs.stat(path.join(out, "index.html"))).size;
const jsSize = (await fs.stat(path.join(out, "assets", "app.js"))).size;
console.log(
  `Built landing/index.html (${size} bytes), app.js (${jsSize} bytes), ${screenFiles.length} screenshots`
);
