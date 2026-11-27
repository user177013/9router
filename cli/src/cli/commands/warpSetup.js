const { execFile: execFileCallback } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execFile = promisify(execFileCallback);

const HELP = `
Usage: 9router warp setup

Download the WARP helper binaries for this machine. Normally the server
auto-installs them on first use — run this only if auto-install fails
(offline host, unsupported platform, or a stale partial download).
`;

function getPlatformTarget(platform = process.platform, architecture = process.arch) {
  const osName = {
    win32: "windows",
    darwin: "darwin",
    linux: "linux",
    freebsd: "freebsd",
  }[platform];

  if (!osName) {
    throw new Error(`Unsupported operating system: ${platform}`);
  }

  return {
    os: osName,
    arch: { x64: "amd64", ia32: "386" }[architecture] || architecture,
    executableExtension: platform === "win32" ? ".exe" : "",
  };
}

function selectReleaseAsset(assets, binary, osName, architecture) {
  return assets.find(({ name }) => {
    if (binary === "wgcf") {
      return name.startsWith("wgcf_") &&
        name.endsWith(`_${osName}_${architecture}${osName === "windows" ? ".exe" : ""}`);
    }

    return name.startsWith(`${binary}_${osName}_${architecture}.`) && name.endsWith(".tar.gz");
  }) ?? null;
}

async function getReleaseAssets(repository) {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    throw new Error(`GitHub release lookup failed for ${repository}: ${response.status} ${response.statusText}`);
  }

  const release = await response.json();
  return release.assets;
}

async function downloadAsset(asset, destination) {
  const response = await fetch(asset.browser_download_url);
  if (!response.ok) {
    throw new Error(`Download failed for ${asset.name}: ${response.status} ${response.statusText}`);
  }

  await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function installWireproxy(asset, binDir, executablePath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "9router-warp-"));
  const archivePath = path.join(tempDir, "wireproxy.tar.gz");
  const executableName = path.basename(executablePath);

  try {
    await downloadAsset(asset, archivePath);
    const { stdout } = await execFile("tar", ["-tzf", archivePath], { maxBuffer: 1024 * 1024 });
    const entries = stdout.split(/\r?\n/).map((entry) => entry.trim());
    if (!entries.includes(executableName)) {
      throw new Error(`${asset.name} does not contain ${executableName} at its root`);
    }

    await execFile("tar", ["-xzf", archivePath, "-C", binDir, executableName]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function getDataDir(platform) {
  const configuredDir = process.env.DATA_DIR;
  if (configuredDir && !(platform === "win32" && configuredDir.startsWith("/"))) {
    return configuredDir;
  }
  if (configuredDir) {
    console.warn(`[DATA_DIR] '${configuredDir}' is a Unix path on Windows; using the default data directory.`);
  }

  if (platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "9router");
  }
  return path.join(os.homedir(), ".9router");
}

async function installWarpBinaries(platform = process.platform, architecture = process.arch) {
  const target = getPlatformTarget(platform, architecture);
  const binDir = path.join(getDataDir(platform), "warp", "bin");
  const wgcfPath = path.join(binDir, `wgcf${target.executableExtension}`);
  const wireproxyPath = path.join(binDir, `wireproxy${target.executableExtension}`);

  await fs.mkdir(binDir, { recursive: true });

  const wgcfAssets = await getReleaseAssets("ViRb3/wgcf");
  const wgcfAsset = selectReleaseAsset(wgcfAssets, "wgcf", target.os, target.arch);
  if (!wgcfAsset) {
    throw new Error(`No wgcf release asset for ${target.os}/${target.arch}`);
  }

  const wireproxyAssets = await getReleaseAssets("pufferffish/wireproxy");
  const wireproxyAsset = selectReleaseAsset(wireproxyAssets, "wireproxy", target.os, target.arch);
  if (!wireproxyAsset) {
    throw new Error(`No wireproxy release asset for ${target.os}/${target.arch}`);
  }

  console.log("==> wgcf");
  await downloadAsset(wgcfAsset, wgcfPath);
  console.log("==> wireproxy");
  await installWireproxy(wireproxyAsset, binDir, wireproxyPath);

  if (platform !== "win32") {
    await fs.chmod(wgcfPath, 0o755);
    await fs.chmod(wireproxyPath, 0o755);
  }

  console.log(`\nWARP binaries installed in ${binDir}`);
  console.log('Next: open the dashboard → Proxy Pools → "WARP", save the pool, and bind it to a connection.');
  console.log("The first use registers a free WARP account; keep Strict Proxy and Auto Hop enabled.");
  console.log("Optional egress check: curl -x http://127.0.0.1:42901 https://www.cloudflare.com/cdn-cgi/trace");
}

async function run(argv = []) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return 0;
  }
  if (argv.length > 0) {
    throw new Error(`Unknown option: ${argv[0]}\n${HELP}`);
  }

  await installWarpBinaries();
  return 0;
}

module.exports = {
  getPlatformTarget,
  installWarpBinaries,
  run,
  selectReleaseAsset,
};
