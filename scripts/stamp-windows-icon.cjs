const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

exports.default = async function stampWindowsIcon(context) {
  if (context.electronPlatformName !== "win32") return;

  const projectDir = context.packager.projectDir;
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(projectDir, "icon.ico");
  const rceditPath = path.join(projectDir, "node_modules", "electron-winstaller", "vendor", "rcedit.exe");

  for (const requiredPath of [exePath, iconPath, rceditPath]) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(`Cannot stamp Windows icon. Missing: ${requiredPath}`);
    }
  }

  const tempRoot = process.env.PUBLIC || os.tmpdir();
  const tempDir = fs.mkdtempSync(path.join(tempRoot, "TalyerPOSIconStamp-"));
  const tempExePath = path.join(tempDir, "TalyerPOS.exe");
  const tempIconPath = path.join(tempDir, "icon.ico");

  try {
    // rcedit is an older Windows tool and can fail on non-ASCII paths.
    // Work in a temporary ASCII path, then copy the stamped executable back.
    fs.copyFileSync(exePath, tempExePath);
    fs.copyFileSync(iconPath, tempIconPath);

    execFileSync(
      rceditPath,
      [
        tempExePath,
        "--set-icon",
        tempIconPath,
        "--set-version-string",
        "FileDescription",
        "TalyerPOS",
        "--set-version-string",
        "ProductName",
        "TalyerPOS",
        "--set-version-string",
        "InternalName",
        "TalyerPOS",
        "--set-version-string",
        "OriginalFilename",
        "TalyerPOS.exe"
      ],
      { stdio: "inherit" }
    );

    fs.copyFileSync(tempExePath, exePath);
    console.log(`Stamped Windows icon into ${exePath}`);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
};
