#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import warpSetup from "../cli/src/cli/commands/warpSetup.js";

export const { getPlatformTarget, installWarpBinaries, selectReleaseAsset } = warpSetup;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  warpSetup.run(process.argv.slice(2)).catch((error) => {
    console.error("WARP setup failed:", error);
    process.exitCode = 1;
  });
}
