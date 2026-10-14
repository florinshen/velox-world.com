#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pages = [
  ["index.html", "https://velox-world.com/"],
  ["velox/index.html", "https://velox-world.com/velox/"],
  ["rpo/index.html", "https://velox-world.com/rpo/"],
  ["rpo/wan2.2/index.html", "https://velox-world.com/rpo/wan2.2/"],
  ["rpo/sd3.5/index.html", "https://velox-world.com/rpo/sd3.5/"],
];

const failures = [];
const read = (path) => readFileSync(resolve(root, path), "utf8");
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const [path, canonical] of pages) {
  const html = read(path);
  const head = html.match(/<head>[\s\S]*?<\/head>/i)?.[0] ?? "";
  const description = head.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1] ?? "";

  expect(/<html\s+lang="en"/i.test(html), `${path}: missing English language declaration`);
  expect(/<title>[^<]{12,}<\/title>/i.test(head), `${path}: missing descriptive title`);
  expect(description.length >= 80 && description.length <= 320, `${path}: description should be 80–320 characters`);
  expect(head.includes(`<link rel="canonical" href="${canonical}">`), `${path}: canonical URL mismatch`);
  expect(/<meta\s+name="robots"\s+content="[^"]*index[^"]*follow/i.test(head), `${path}: missing index/follow directive`);
  expect(/<meta\s+property="og:title"/i.test(head), `${path}: missing Open Graph title`);
  expect(/<meta\s+property="og:description"/i.test(head), `${path}: missing Open Graph description`);
  expect(/<meta\s+property="og:image"/i.test(head), `${path}: missing Open Graph image`);
  expect(/<meta\s+name="twitter:card"/i.test(head), `${path}: missing Twitter card`);
  expect(head.includes("https://velox-world.com/llms.txt"), `${path}: missing LLM-summary discovery link`);
  expect(head.includes("https://velox-world.com/sitemap.xml"), `${path}: missing sitemap discovery link`);

  const jsonLdBlocks = [...head.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  expect(jsonLdBlocks.length > 0, `${path}: missing JSON-LD`);
  for (const [, block] of jsonLdBlocks) {
    try {
      JSON.parse(block);
    } catch (error) {
      failures.push(`${path}: invalid JSON-LD (${error.message})`);
    }
  }
}

const robots = read("robots.txt");
for (const agent of ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended"]) {
  expect(robots.includes(`User-agent: ${agent}`), `robots.txt: missing ${agent}`);
}
expect(robots.includes("Sitemap: https://velox-world.com/sitemap.xml"), "robots.txt: missing canonical sitemap URL");

const sitemap = read("sitemap.xml");
for (const [, canonical] of pages) {
  expect(sitemap.includes(`<loc>${canonical}</loc>`), `sitemap.xml: missing ${canonical}`);
}

const llms = read("llms.txt");
const llmsFull = read("llms-full.txt");
expect(llms.includes("https://velox-world.com/llms-full.txt"), "llms.txt: missing full-context link");
expect(llmsFull.includes("Do not describe the work as peer reviewed"), "llms-full.txt: missing release-status guardrail");

const indexNowKey = read("indexnow-key.txt").trim();
expect(/^[A-Za-z0-9-]{8,128}$/.test(indexNowKey), "indexnow-key.txt: invalid IndexNow ownership key");

if (failures.length) {
  console.error(`SEO validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`SEO validation passed for ${pages.length} canonical pages.`);
