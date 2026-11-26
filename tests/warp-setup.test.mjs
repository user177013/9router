import assert from "node:assert/strict";
import test from "node:test";
import { getPlatformTarget, selectReleaseAsset } from "../scripts/warp-setup.mjs";

test("maps supported operating systems and architectures to release names", () => {
  assert.deepEqual(getPlatformTarget("win32", "x64"), {
    os: "windows",
    arch: "amd64",
    executableExtension: ".exe",
  });
  assert.deepEqual(getPlatformTarget("darwin", "arm64"), {
    os: "darwin",
    arch: "arm64",
    executableExtension: "",
  });
  assert.deepEqual(getPlatformTarget("linux", "x64"), {
    os: "linux",
    arch: "amd64",
    executableExtension: "",
  });
  assert.deepEqual(getPlatformTarget("linux", "ia32"), {
    os: "linux",
    arch: "386",
    executableExtension: "",
  });
});

test("rejects operating systems without a known release naming convention", () => {
  assert.throws(() => getPlatformTarget("aix", "x64"), /Unsupported operating system/);
});

test("selects only an exact OS and architecture release asset", () => {
  const assets = [
    { name: "wgcf_2.3.1_windows_amd64.exe", browser_download_url: "wgcf-win-x64" },
    { name: "wgcf_2.3.1_windows_arm64.exe", browser_download_url: "wgcf-win-arm64" },
    { name: "wireproxy_windows_amd64.tar.gz", browser_download_url: "win-x64" },
    { name: "wireproxy_linux_amd64.tar.gz", browser_download_url: "linux-x64" },
    { name: "wireproxy_darwin_arm64.tar.gz", browser_download_url: "mac-arm64" },
  ];

  assert.equal(selectReleaseAsset(assets, "wgcf", "windows", "amd64").browser_download_url, "wgcf-win-x64");
  assert.equal(selectReleaseAsset(assets, "wgcf", "windows", "arm64").browser_download_url, "wgcf-win-arm64");
  assert.equal(selectReleaseAsset(assets, "wireproxy", "windows", "amd64").browser_download_url, "win-x64");
  assert.equal(selectReleaseAsset(assets, "wireproxy", "darwin", "arm64").browser_download_url, "mac-arm64");
  assert.equal(selectReleaseAsset(assets, "wireproxy", "windows", "arm64"), null);
  assert.equal(selectReleaseAsset(assets, "wireproxy", "windows", "386"), null);
});
