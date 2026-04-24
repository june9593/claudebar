#!/usr/bin/env node
// Notarize and staple every DMG in release-artifacts/ produced by electron-builder.
// electron-builder's `notarize: true` only notarizes the .app inside; the outer
// DMG ends up without a stapled ticket, which fails offline Gatekeeper checks.
// This script submits each DMG to Apple via notarytool, then staples the ticket.
//
// Required env vars (same ones electron-builder uses):
//   APPLE_API_KEY        absolute path to AuthKey_XXXX.p8
//   APPLE_API_KEY_ID     10-char key ID
//   APPLE_API_ISSUER     issuer UUID

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const DIR = "release-artifacts";
const { APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER } = process.env;

if (!APPLE_API_KEY || !APPLE_API_KEY_ID || !APPLE_API_ISSUER) {
  console.error("[notarize-dmg] missing APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER — skip");
  process.exit(0);
}

const dmgs = readdirSync(DIR)
  .filter((f) => f.endsWith(".dmg"))
  .map((f) => join(DIR, f))
  .filter((p) => statSync(p).isFile());

if (dmgs.length === 0) {
  console.log("[notarize-dmg] no .dmg files in", DIR);
  process.exit(0);
}

function run(cmd, args) {
  console.log(`[notarize-dmg] $ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

for (const dmg of dmgs) {
  console.log(`\n[notarize-dmg] === ${dmg} ===`);
  run("xcrun", [
    "notarytool", "submit", dmg,
    "--key", APPLE_API_KEY,
    "--key-id", APPLE_API_KEY_ID,
    "--issuer", APPLE_API_ISSUER,
    "--wait",
  ]);
  run("xcrun", ["stapler", "staple", dmg]);
  run("xcrun", ["stapler", "validate", dmg]);
}

console.log("\n[notarize-dmg] done");
