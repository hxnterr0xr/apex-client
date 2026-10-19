const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { Client } = require('minecraft-launcher-core');
const { Auth } = require('msmc');

const ROOT = path.join(app.getPath('userData'), 'game');
const AUTH_FILE = path.join(app.getPath('userData'), 'account.bin');
const UA = { 'User-Agent': 'apex-client/0.1.0 (open-source launcher)' };
let win, session = null, accountName = '', restorePromise;
const inst = version => path.join(ROOT, 'instances', version);

function log(message, level = 'info') {
  const line = String(message ?? '').trim();
  if (!line) return;
  if (win && !win.isDestroyed()) win.webContents.send('log', { message: line, level, time: new Date().toISOString() });
}
function send(channel, value) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, value);
}
async function json(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} while downloading ${new URL(url).hostname}`);
  return response.json();
}

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 620,
    frame: false, icon: path.join(__dirname, '..', 'icon.ico'),
    backgroundColor: '#101116', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-fail-load', (_, code, description) => log(`Launcher interface failed to load (${code}): ${description}`, 'error'));
});

ipcMain.on('win', (_, action) => action === 'min' ? win?.minimize() : app.quit());

async function restoreAccount() {
  if (restorePromise) return restorePromise;
  restorePromise = (async () => {
    if (!fs.existsSync(AUTH_FILE) || !safeStorage.isEncryptionAvailable()) return null;
    try {
      const saved = safeStorage.decryptString(fs.readFileSync(AUTH_FILE));
      const xbox = await new Auth('select_account').refresh(saved);
      const mc = await xbox.getMinecraft();
      session = mc.mclc(); accountName = mc.profile.name;
      log(`Restored Microsoft account: ${accountName}`);
      return { name: accountName };
    } catch (error) {
      session = null; accountName = '';
      try { fs.unlinkSync(AUTH_FILE); } catch {}
      log(`Saved sign-in expired. Sign in again to continue. ${error.message || error}`, 'warn');
      return null;
    }
  })();
  return restorePromise;
}

ipcMain.handle('account', () => restoreAccount());
ipcMain.handle('login', async () => {
  log('Opening Microsoft sign-in…');
  const xbox = await new Auth('select_account').launch('electron');
  const mc = await xbox.getMinecraft();
  session = mc.mclc(); accountName = mc.profile.name;
  if (safeStorage.isEncryptionAvailable()) {
    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
    fs.writeFileSync(AUTH_FILE, safeStorage.encryptString(xbox.save()));
    log('Microsoft sign-in saved securely on this device.');
  } else log('Secure local storage is unavailable; sign-in will not persist after closing the app.', 'warn');
  restorePromise = Promise.resolve({ name: accountName });
  log(`Signed in as ${accountName}`);
  return { name: accountName };
});
ipcMain.handle('logout', () => {
  session = null; accountName = ''; restorePromise = Promise.resolve(null);
  try { fs.unlinkSync(AUTH_FILE); } catch {}
  log('Account signed out.');
  return true;
});

ipcMain.handle('search', async (_, { query, kind, version, loader }) => {
  const facets = [[`project_type:${kind}`], [`versions:${version}`]];
  if (kind === 'mod') facets.push([`categories:${loader}`]);
  const url = `https://api.modrinth.com/v2/search?limit=20&query=${encodeURIComponent(query || '')}&facets=${encodeURIComponent(JSON.stringify(facets))}`;
  const result = await json(url, { headers: UA });
  return result.hits.map(h => ({ id: h.project_id, title: h.title, desc: h.description, icon: h.icon_url, downloads: h.downloads, author: h.author }));
});

ipcMain.handle('install', async (_, { id, kind, version, loader }) => {
  const query = new URLSearchParams({ game_versions: JSON.stringify([version]) });
  if (kind === 'mod') query.set('loaders', JSON.stringify([loader]));
  const versions = await json(`https://api.modrinth.com/v2/project/${encodeURIComponent(id)}/version?${query}`, { headers: UA });
  if (!versions.length) throw new Error('No compatible version found');
  const file = versions[0].files.find(item => item.primary) || versions[0].files[0];
  const folder = path.join(inst(version), { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' }[kind]);
  fs.mkdirSync(folder, { recursive: true });
  const response = await fetch(file.url);
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  fs.writeFileSync(path.join(folder, file.filename), Buffer.from(await response.arrayBuffer()));
  log(`Installed ${file.filename} for Minecraft ${version}`);
  return file.filename;
});

async function ensureFabric(mc) {
  log(`Checking Fabric support for Minecraft ${mc}…`);
  const list = await json(`https://meta.fabricmc.net/v2/versions/loader/${mc}`);
  if (!list.length) throw new Error(`Fabric is not available for Minecraft ${mc}`);
  const loaderVersion = list[0].loader.version;
  const profile = await json(`https://meta.fabricmc.net/v2/versions/loader/${mc}/${loaderVersion}/profile/json`);
  const dir = path.join(ROOT, 'versions', profile.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${profile.id}.json`), JSON.stringify(profile));
  log(`Installed Fabric Loader ${loaderVersion}`);
  return profile.id;
}

async function installExtras(mc) {
  const mods = path.join(inst(mc), 'mods'); fs.mkdirSync(mods, { recursive: true });
  const query = new URLSearchParams({ game_versions: JSON.stringify([mc]), loaders: '["fabric"]' });
  const versions = await json(`https://api.modrinth.com/v2/project/fabric-api/version?${query}`, { headers: UA });
  if (versions.length) {
    const file = versions[0].files.find(item => item.primary) || versions[0].files[0];
    const destination = path.join(mods, file.filename);
    if (!fs.existsSync(destination)) {
      const response = await fetch(file.url);
      if (!response.ok) throw new Error(`Fabric API download failed (${response.status})`);
      fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
      log(`Installed Fabric API ${versions[0].version_number}`);
    }
  }
  const bundled = path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'), 'bundled', `apex-hud-${mc}.jar`);
  if (fs.existsSync(bundled)) fs.copyFileSync(bundled, path.join(mods, 'apex-hud.jar'));
}

let manifestPromise;
const manifest = () => manifestPromise ||= json('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');

ipcMain.handle('versions', async () => {
  try {
    return (await manifest()).versions.filter(v => v.type === 'release').map(v => v.id).filter(id => {
      const [major, minor] = id.split('.').map(Number); return major > 1 || (major === 1 && minor >= 19);
    });
  } catch (error) {
    log(`Could not load Minecraft versions: ${error.message}`, 'warn');
    return ['1.21.1', '1.20.4', '1.20.1', '1.19.4'];
  }
});

async function ensureJava(id) {
  log(`Finding the Java runtime for Minecraft ${id}…`);
  const gameVersion = (await manifest()).versions.find(item => item.id === id);
  if (!gameVersion) throw new Error(`Minecraft ${id} is missing from Mojang's version list`);
  const metadata = await json(gameVersion.url);
  const component = metadata.javaVersion?.component || 'jre-legacy';
  const platform = { win32: process.arch === 'arm64' ? 'windows-arm64' : 'windows-x64', linux: 'linux', darwin: process.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os' }[process.platform];
  if (!platform) throw new Error(`A Java runtime is not available for ${process.platform}`);
  const directory = path.join(ROOT, 'runtime', component);
  const executable = process.platform === 'win32' ? path.join(directory, 'bin', 'javaw.exe')
    : process.platform === 'darwin' ? path.join(directory, 'jre.bundle', 'Contents', 'Home', 'bin', 'java') : path.join(directory, 'bin', 'java');
  if (fs.existsSync(executable)) return executable;
  const runtimeCatalog = await json('https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json');
  const entry = runtimeCatalog[platform]?.[component]?.[0];
  if (!entry) throw new Error(`Mojang has no Java runtime for ${id} on ${platform}`);
  const runtimeFiles = Object.entries((await json(entry.manifest.url)).files).filter(([, file]) => file.type === 'file');
  log(`Downloading Java runtime (${runtimeFiles.length} files)…`);
  let complete = 0;
  for (let index = 0; index < runtimeFiles.length; index += 8) {
    await Promise.all(runtimeFiles.slice(index, index + 8).map(async ([relative, file]) => {
      const destination = path.join(directory, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      if (!fs.existsSync(destination) || fs.statSync(destination).size !== file.size) {
        const response = await fetch(file.downloads.raw.url);
        if (!response.ok) throw new Error(`Java runtime download failed (${response.status})`);
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length !== file.size) throw new Error(`Java runtime file was incomplete: ${relative}`);
        fs.writeFileSync(destination, buffer);
      }
      if (file.executable && process.platform !== 'win32') fs.chmodSync(destination, 0o755);
      complete++;
      send('progress', { task: complete, total: runtimeFiles.length, label: 'Preparing Java' });
    }));
  }
  if (!fs.existsSync(executable)) throw new Error(`Java finished downloading, but ${path.basename(executable)} is missing`);
  log('Java runtime is ready.');
  return executable;
}

let launching = false;
ipcMain.handle('launch', async (_, { version, loader, ram }) => {
  if (launching) throw new Error('Minecraft is already starting or running.');
  if (!session) {
    const restored = await restoreAccount();
    if (!restored) throw new Error('Sign in with Microsoft before launching Minecraft.');
  }
  launching = true;
  const selectedRam = Math.max(2, Math.min(16, Number(ram) || 4));
  log(`Starting Minecraft ${version} (${loader}, ${selectedRam} GB RAM)…`);
  send('launch-state', { active: true, label: 'Preparing game…' });
  try {
    send('notice', `Preparing Minecraft ${version}…`);
    const javaPath = await ensureJava(version);
    const gameVersion = { number: version, type: 'release' };
    if (loader === 'fabric') {
      gameVersion.custom = await ensureFabric(version);
      await installExtras(version);
    }
    const launcher = new Client();
    launcher.on('progress', progress => send('progress', progress));
    launcher.on('debug', message => log(message, 'debug'));
    launcher.on('data', message => log(message, /\b(error|exception|failed)\b/i.test(String(message)) ? 'error' : 'game'));
    launcher.on('download', message => log(`Downloaded ${message}`, 'debug'));
    launcher.on('close', code => {
      log(`Minecraft closed with exit code ${code}.`, Number(code) ? 'warn' : 'info');
      launching = false; send('closed', code); send('launch-state', { active: false });
    });
    launcher.on('error', error => {
      launching = false;
      log(`Game process error: ${error.message || error}`, 'error');
      send('launch-state', { active: false, label: 'Game failed to start · see Console Logs' });
    });
    send('notice', 'Downloading game files and starting Minecraft…');
    const child = await launcher.launch({
      authorization: session, root: ROOT, javaPath, version: gameVersion,
      memory: { max: `${selectedRam}G`, min: '1G' },
      overrides: { gameDirectory: inst(version) },
    });
    if (!child) throw new Error('The launcher did not create a Minecraft process. Check Console Logs for details.');
    log(`Minecraft process started${child.pid ? ` (process ${child.pid})` : ''}.`);
    send('launch-state', { active: true, label: 'Minecraft is running' });
    return { started: true };
  } catch (error) {
    launching = false;
    log(`Launch failed: ${error.stack || error.message || error}`, 'error');
    send('launch-state', { active: false });
    throw new Error(error.message || String(error));
  }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
