#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const key = "738b8b49fb136bdf2ace703416692f38";
const keyFile = "indexnow-key.txt";
const sitemap = readFileSync(resolve(root, "sitemap.xml"), "utf8");
const urlList = [...sitemap.matchAll(/<loc>(https:\/\/velox-world\.com\/[^<]*)<\/loc>/g)].map((match) => match[1]);

if (readFileSync(resolve(root, keyFile), "utf8").trim() !== key) {
  throw new Error("IndexNow ownership key file does not match the configured key.");
}
if (!urlList.length) throw new Error("No canonical URLs found in sitemap.xml.");

const payload = {
  host: "velox-world.com",
  key,
  keyLocation: `https://velox-world.com/${keyFile}`,
  urlList,
};

if (process.argv.includes("--dry-run")) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload),
});

if (![200, 202].includes(response.status)) {
  throw new Error(`IndexNow submission failed: HTTP ${response.status} ${await response.text()}`);
}

console.log(`IndexNow accepted ${urlList.length} canonical URLs (HTTP ${response.status}).`);
