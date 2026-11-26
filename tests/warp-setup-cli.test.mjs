import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the npm CLI advertises WARP setup without requiring a source checkout", () => {
  const result = spawnSync(process.execPath, ["cli.js", "--help"], {
    cwd: path.join(repoRoot, "cli"),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /warp setup/);
  assert.match(result.stdout, /install WARP helper binaries/i);
});
