const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Used by both update paths below to find the latest GitHub Release —
// same repo the build workflow (.github/workflows/build-app.yml) publishes
// installers to.
const UPDATE_REPO = 'samuelajay99/1cloudhub-tracker';

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 820,
    minHeight: 560,
    title: 'Compass — Orbit',
    backgroundColor: '#F7F9FC',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  // Query param, not a preload/contextBridge — simplest way to hand the
  // renderer a read-only value without touching the contextIsolation setup.
  win.loadFile('index.html', { query: { v: app.getVersion() } });
  return win;
}

// ---------- Windows: full auto-update via electron-updater ----------
// Silent background download + native OS notification + install on next
// restart. Never touched on Mac — that's the signing-gated Squirrel.Mac
// path, and Compass is deliberately unsigned (see README.md).
function checkForUpdatesWindows() {
  const { autoUpdater } = require('electron-updater');
  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // A failed check (offline, GitHub hiccup, etc.) should never surface
    // to the user — it'll just try again on the next launch.
  });
}

// Simple X.Y.Z comparator — release tags in this repo are always plain
// vX.Y.Z, not worth a semver dependency for this.
function isNewerVersion(candidate, current) {
  const a = candidate.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const na = a[i] || 0;
    const nb = b[i] || 0;
    if (na !== nb) return na > nb;
  }
  return false;
}

// ---------- macOS: notifier + auto-download + guided open ----------
// No code signing means no reliable silent auto-update on Mac (Squirrel.Mac
// verifies updates against the running app's signature). This gets as
// close as is safe to do without one: detect the new version, download the
// right .dmg, and open it so the only manual step left is dragging Compass
// into Applications — the same gesture every user already did on first
// install. Deliberately does NOT try to close the running app, replace the
// .app bundle, or relaunch automatically — that pattern is fragile without
// signature verification and reads as malware behavior to Gatekeeper.
async function checkForUpdatesMac(win) {
  try {
    const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`);
    if (!res.ok) return;
    const release = await res.json();

    const latestVersion = String(release.tag_name || '').replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(latestVersion)) return;
    if (!isNewerVersion(latestVersion, app.getVersion())) return;

    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Compass update available',
      message: `Compass ${latestVersion} is available — you're on ${app.getVersion()}.`,
      detail: (release.body || '').slice(0, 500),
      buttons: ['Download & Install', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return;

    const assetName = process.arch === 'arm64' ? 'Compass-mac-arm64.dmg' : 'Compass-mac-x64.dmg';
    const asset = (release.assets || []).find((a) => a.name === assetName);
    if (!asset) {
      dialog.showMessageBox(win, {
        type: 'error',
        message: `Could not find ${assetName} in the latest release — please download it from the website instead.`,
      });
      return;
    }

    const dest = path.join(app.getPath('temp'), assetName);
    const download = await fetch(asset.browser_download_url);
    if (!download.ok || !download.body) throw new Error('download failed');

    const total = Number(download.headers.get('content-length') || 0);
    let received = 0;
    const fileStream = fs.createWriteStream(dest);
    const reader = download.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      fileStream.write(Buffer.from(value));
      if (total) win.setProgressBar(received / total);
    }
    fileStream.end();
    await new Promise((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });
    win.setProgressBar(-1);

    await shell.openPath(dest);
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Downloaded',
      message: 'Drag Compass into Applications, then relaunch to finish updating.',
    });
  } catch (e) {
    // Same rule as the Windows path: a failed check/download is invisible
    // to the user, not an error dialog — it'll just try again next launch.
  }
}

app.whenReady().then(() => {
  const win = createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Delayed so it never competes with app startup; skipped entirely for
  // unpackaged dev runs (`npx electron .`), where there's no real installed
  // version to compare against.
  if (app.isPackaged) {
    setTimeout(() => {
      if (process.platform === 'win32') {
        checkForUpdatesWindows();
      } else if (process.platform === 'darwin') {
        checkForUpdatesMac(win);
      }
    }, 3000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
