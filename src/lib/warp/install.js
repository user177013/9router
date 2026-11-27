// Cross-OS auto-installer for the WARP helper binaries (wgcf + wireproxy).
//
// The server-side hop engine (index.js) needs two native helpers that were a
// manual "9router warp setup" step. This makes first use self-installing on
// Windows / macOS / Linux using only node:zlib + a minimal ustar reader — no
// `tar` binary and no extra npm package — so it also works on minimal images.
//
// Integrity posture (mirrors cli/hooks/trayRuntime.js):
//   * Versions are PINNED (not `latest`), so the artifact can only change by a
//     deliberate re-pin here.
//   * Every download is SHA-256-verified against the pinned release's published
//     checksums.txt before it is written to disk. Mismatch / missing entry →
//     fail closed: the bytes are never written and the binary never executed.
// Bump WGCF_VERSION / WIREPROXY_VERSION together with a re-verification of the
// release checksums when you need a newer helper.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { getDataDir } from "../dataDir.js";

const WGCF_REPO = "ViRb3/wgcf";
const WIREPROXY_REPO = "pufferffish/wireproxy";
// Pinned to exact versions — no silent "latest" swap. Re-verify the release
// checksums when bumping these.
const WGCF_VERSION = "v2.3.1";
const WIREPROXY_VERSION = "v1.1.3";

const binDir = path.join(getDataDir(), "warp", "bin");

// Single-flight so a burst of concurrent pool resolutions never downloads twice.
let inflight = null;

// Precondition: platform is a supported host.
// Postcondition: { os, arch, ext } matching the release-asset naming convention.
// Errors: throws on unsupported platforms.
export function platformTarget(platform = process.platform, arch = process.arch) {
  const osName = { win32: "windows", darwin: "darwin", linux: "linux", freebsd: "freebsd" }[platform];
  if (!osName) throw new Error(`WARP auto-install unsupported on ${platform}`);
  return {
    os: osName,
    arch: { x64: "amd64", ia32: "386" }[arch] || arch,
    ext: platform === "win32" ? ".exe" : "",
  };
}

// Pick the exact single release asset for a target binary + platform. Mirrors the
// CLI setup's selectReleaseAsset so both paths land on the same artifact.
// Postcondition: the matching asset object, or null when unsupported.
export function selectAsset(assets, binary, osName, arch) {
  return assets.find((a) => {
    const n = a.name;
    if (binary === "wgcf") {
      const suffix = `_${osName}_${arch}${osName === "windows" ? ".exe" : ""}`;
      return n.startsWith("wgcf_") && n.endsWith(suffix);
    }
    return n.startsWith(`${binary}_${osName}_${arch}.`) && n.endsWith(".tar.gz");
  }) ?? null;
}

// SHA-256 of a buffer as a lowercase hex string.
export function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// Parse a SHA-256 `checksums.txt` ("<64-hex>  <filename>") into a name→hex map.
// Lines that don't match the canonical shape are ignored.
export function parseChecksums(text) {
  const map = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.trim().match(/^([0-9a-f]{64})\s+(\S+)$/);
    if (m) map.set(m[2], m[1]);
  }
  return map;
}

async function releaseAssets(repo, version) {
  // Pin to the exact tag so the asset set is deterministic and stable.
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${version}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub release lookup failed for ${repo}@${version}: ${res.status}`);
  return (await res.json()).assets;
}

async function checksumsFor(repo, version) {
  const url = `https://github.com/${repo}/releases/download/${version}/checksums.txt`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`checksum fetch failed (${res.status}): ${url}`);
  return parseChecksums(await res.text());
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Fails closed: returns true only when buf's SHA-256 matches the pinned
// checksums for assetName. A missing entry is treated as a mismatch.
function verifyIntegrity(buf, checksums, assetName) {
  const expected = checksums.get(assetName);
  if (!expected) throw new Error(`no pinned checksum for ${assetName} — refusing to install`);
  if (sha256Hex(buf) !== expected.toLowerCase()) {
    throw new Error(`SHA-256 mismatch for ${assetName} — refusing to install`);
  }
}

// Minimal ustar extractor for the single root-level binary in a release archive.
// gunzips the whole payload, then walks 512-byte blocks; for the regular-file
// entry whose basename equals targetName it writes the bytes to outDir/targetName.
// No GNU long-name / PAX support is needed — both releases ship the binary at the
// archive root under a plain name.
// Preconditions: tarGz is a verified .tar.gz buffer; targetName is a basename.
// Postcondition: outDir/targetName written (0755 on non-Windows); returns its path.
// Errors: throws if the archive lacks that entry.
export function extractTarGz(tarGz, targetName, outDir) {
  const buf = zlib.gunzipSync(tarGz);
  const isWin = process.platform === "win32";
  let offset = 0;
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break; // all-zero block = end padding
    // ustar name is space-padded (some tools null-pad); strip both.
    const name = header.subarray(0, 100).toString("utf8").replace(/[\0 ]+$/g, "");
    const typeflag = String.fromCharCode(header[156]);
    const size = parseInt(header.subarray(124, 136).toString("utf8").replace(/\0+$/g, "").trim(), 8) || 0;
    const dataStart = offset + 512;
    if ((typeflag === "0" || typeflag === "\0" || typeflag === "8") && path.basename(name) === targetName && size > 0) {
      const outPath = path.join(outDir, targetName);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(outPath, buf.subarray(dataStart, dataStart + size));
      if (!isWin) fs.chmodSync(outPath, 0o755);
      return outPath;
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  throw new Error(`wireproxy archive does not contain ${targetName}`);
}

function binaryPresent(name) {
  return fs.existsSync(path.join(binDir, `${name}${platformTarget().ext}`));
}

// Preconditions: called when one or both binaries are missing.
// Postcondition: both wgcf and wireproxy present under binDir, each verified
// against its pinned release checksums before being written.
// Errors: throws on unsupported platform / missing asset / checksum mismatch /
// network failure (fail-closed — nothing unverified is ever written).
export async function ensureWarpBinaries() {
  if (binaryPresent("wgcf") && binaryPresent("wireproxy")) return;
  if (inflight) return inflight;

  inflight = (async () => {
    const target = platformTarget();
    const ext = target.ext;
    fs.mkdirSync(binDir, { recursive: true });

    // wgcf (plain binary, verified whole)
    const wgcfAsset = selectAsset(await releaseAssets(WGCF_REPO, WGCF_VERSION), "wgcf", target.os, target.arch);
    if (!wgcfAsset) throw new Error(`No wgcf release asset for ${target.os}/${target.arch} @${WGCF_VERSION}`);
    const wgcfChecksums = await checksumsFor(WGCF_REPO, WGCF_VERSION);
    const wgcfBuf = await fetchBuffer(wgcfAsset.browser_download_url);
    verifyIntegrity(wgcfBuf, wgcfChecksums, wgcfAsset.name);
    const wgcfPath = path.join(binDir, `wgcf${ext}`);
    fs.writeFileSync(wgcfPath, wgcfBuf);
    if (process.platform !== "win32") fs.chmodSync(wgcfPath, 0o755);

    // wireproxy (tar.gz; verify the archive, then extract the inner binary)
    const wireAsset = selectAsset(await releaseAssets(WIREPROXY_REPO, WIREPROXY_VERSION), "wireproxy", target.os, target.arch);
    if (!wireAsset) throw new Error(`No wireproxy release asset for ${target.os}/${target.arch} @${WIREPROXY_VERSION}`);
    const wireChecksums = await checksumsFor(WIREPROXY_REPO, WIREPROXY_VERSION);
    const wireBuf = await fetchBuffer(wireAsset.browser_download_url);
    verifyIntegrity(wireBuf, wireChecksums, wireAsset.name);
    extractTarGz(wireBuf, path.basename(path.join(binDir, `wireproxy${ext}`)), binDir);
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

// Best-effort wrapper: auto-install can fail offline or on an unsupported
// platform. Returns true when both binaries are present (pre-existing or just
// installed + verified), false otherwise — callers fall back to the manual hint.
export async function tryAutoInstall() {
  try {
    await ensureWarpBinaries();
    return true;
  } catch (e) {
    console.warn(`[WARP] auto-install of helper binaries failed: ${String(e.message || e)}`);
    return false;
  }
}
