const { app, BrowserWindow, ipcMain, shell, safeStorage } = require('electron');
const path = require('path'), fs = require('fs');
const { Client } = require('minecraft-launcher-core');
const { Auth } = require('msmc');

const ROOT = path.join(app.getPath('userData'), 'game');
const UA = { 'User-Agent': 'apex-client/0.1.0 (open-source launcher)' };
let win, session = null;
const inst = v => path.join(ROOT, 'instances', v);

app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1100, height: 720, frame: false, icon: path.join(__dirname,'..','icon.ico'), backgroundColor: '#080c16',
    webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  win.loadFile(path.join(__dirname, 'index.html'));
});

ipcMain.on('win', (_, a) => a === 'min' ? win.minimize() : app.quit());

// Microsoft login (official account required, no offline/cracked mode)
// Remembered sign-in: the refresh token is encrypted with Windows' own protection and kept on this PC only
const TOKEN = () => path.join(app.getPath('userData'), 'account.bin');
const saveToken = t => { try { if (safeStorage.isEncryptionAvailable()) fs.writeFileSync(TOKEN(), safeStorage.encryptString(t)); } catch {} };
const readToken = () => { try { return safeStorage.decryptString(fs.readFileSync(TOKEN())); } catch { return null; } };
async function useAccount(x) {
  const mc = await x.getMinecraft(); session = mc.mclc();
  saveToken(x.save());
  return { name: mc.profile.name, id: mc.profile.id };
}
ipcMain.handle('login', async () => useAccount(await new Auth('select_account').launch('electron')));
ipcMain.handle('autologin', async () => {
  const t = readToken(); if (!t) return null;
  try { return await useAccount(await new Auth('select_account').refresh(t)); } catch { return null; }
});
ipcMain.handle('logout', () => { session = null; try { fs.unlinkSync(TOKEN()); } catch {} });

// Modrinth search: kind = mod | resourcepack | shader
ipcMain.handle('search', async (_, { query, kind, version, loader }) => {
  const facets = [[`project_type:${kind}`], [`versions:${version}`]];
  if (kind === 'mod') facets.push([`categories:${loader}`]);
  const u = `https://api.modrinth.com/v2/search?limit=20&query=${encodeURIComponent(query || '')}&facets=${encodeURIComponent(JSON.stringify(facets))}`;
  const r = await (await fetch(u, { headers: UA })).json();
  return r.hits.map(h => ({ id: h.project_id, title: h.title, desc: h.description, icon: h.icon_url, downloads: h.downloads, author: h.author }));
});

// Download newest compatible file into the right folder
ipcMain.handle('install', async (_, { id, kind, version, loader }) => {
  const q = new URLSearchParams({ game_versions: JSON.stringify([version]) });
  if (kind === 'mod') q.set('loaders', JSON.stringify([loader]));
  const vs = await (await fetch(`https://api.modrinth.com/v2/project/${id}/version?${q}`, { headers: UA })).json();
  if (!vs.length) throw new Error('No compatible version found');
  const f = vs[0].files.find(x => x.primary) || vs[0].files[0];
  const dir = path.join(inst(version), { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' }[kind]);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, f.filename), Buffer.from(await (await fetch(f.url)).arrayBuffer()));
  return f.filename;
});

// Install Fabric profile JSON, then launch
async function ensureFabric(mc) {
  const list = await (await fetch(`https://meta.fabricmc.net/v2/versions/loader/${mc}`)).json();
  const lv = list[0].loader.version;
  const prof = await (await fetch(`https://meta.fabricmc.net/v2/versions/loader/${mc}/${lv}/profile/json`)).json();
  const dir = path.join(ROOT, 'versions', prof.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, prof.id + '.json'), JSON.stringify(prof));
  return prof.id;
}

async function installExtras(mc) {
  const mods = path.join(inst(mc), 'mods'); fs.mkdirSync(mods, { recursive: true });
  const q = new URLSearchParams({ game_versions: JSON.stringify([mc]), loaders: '["fabric"]' });
  const vs = await (await fetch(`https://api.modrinth.com/v2/project/fabric-api/version?${q}`, { headers: UA })).json();
  if (vs.length) { const f = vs[0].files.find(x => x.primary) || vs[0].files[0], p = path.join(mods, f.filename);
    if (!fs.existsSync(p)) fs.writeFileSync(p, Buffer.from(await (await fetch(f.url)).arrayBuffer())); }
  const bundled = path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'), 'bundled', `apex-hud-${mc}.jar`);
  if (fs.existsSync(bundled)) fs.copyFileSync(bundled, path.join(mods, 'apex-hud.jar'));
}

let MAN;
const manifest = async () => MAN ||= await (await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')).json();

// Every release from 1.19 up to the newest one Mojang has published (list updates itself)
ipcMain.handle('versions', async () => {
  try {
    return (await manifest()).versions.filter(v => v.type === 'release').map(v => v.id).filter(id => {
      const [a, b] = id.split('.').map(Number); return a > 1 || (a === 1 && b >= 19);
    });
  } catch { return ['1.21.1', '1.20.4', '1.20.1', '1.19.4']; }
});

// Downloads the exact Java Mojang wants for that version (8 / 17 / 21 / newer), no manual Java install
async function ensureJava(id) {
  const v = (await manifest()).versions.find(x => x.id === id);
  const vj = await (await fetch(v.url)).json();
  const comp = (vj.javaVersion && vj.javaVersion.component) || 'jre-legacy';
  const plat = { win32: 'windows-x64', linux: 'linux', darwin: process.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os' }[process.platform];
  const dir = path.join(ROOT, 'runtime', comp);
  const exe = process.platform === 'win32' ? path.join(dir, 'bin', 'javaw.exe')
    : process.platform === 'darwin' ? path.join(dir, 'jre.bundle', 'Contents', 'Home', 'bin', 'java') : path.join(dir, 'bin', 'java');
  if (fs.existsSync(exe)) return exe;
  const all = await (await fetch('https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json')).json();
  const entry = all[plat] && all[plat][comp] && all[plat][comp][0];
  if (!entry) throw new Error('No Java is available for this computer');
  const files = Object.entries((await (await fetch(entry.manifest.url)).json()).files).filter(([, f]) => f.type === 'file');
  let n = 0;
  for (let i = 0; i < files.length; i += 10)
    await Promise.all(files.slice(i, i + 10).map(async ([rel, f]) => {
      const dest = path.join(dir, rel); fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(await (await fetch(f.downloads.raw.url)).arrayBuffer()));
      if (f.executable) fs.chmodSync(dest, 0o755);
      win.webContents.send('progress', { task: ++n, total: files.length });
    }));
  return exe;
}

ipcMain.handle('launch', async (_, { version, loader, ram }) => {
  const saved = readToken();  // keep the game session fresh if the launcher stayed open for hours
  if (saved) { try { await useAccount(await new Auth('select_account').refresh(saved)); } catch {} }
  if (!session) throw new Error('Sign in first');
  const v = { number: version, type: 'release' };
  win.webContents.send('notice', 'Getting Java ready (first launch of this version is slower)…');
  const javaPath = await ensureJava(version);
  if (loader === 'fabric') {
    try { v.custom = await ensureFabric(version); await installExtras(version); }
    catch (e) { win.webContents.send('notice', `Fabric isn't available for ${version} yet, launching vanilla instead.`); }
  }
  fs.mkdirSync(ROOT, { recursive: true });
  const logFile = path.join(ROOT, 'launcher.log');
  fs.writeFileSync(logFile, `Apex Client launch: ${version} (${loader})\nJava: ${javaPath}\n`);
  const log = m => fs.appendFileSync(logFile, String(m).trimEnd() + '\n');
  const l = new Client();
  l.on('progress', p => win.webContents.send('progress', p));
  l.on('debug', log); l.on('data', log);
  l.on('close', code => { log('Game closed with code ' + code); win.webContents.send('closed', code); });
  try {
    const proc = await l.launch({ authorization: session, root: ROOT, javaPath, version: v, memory: { max: ram + 'G', min: '1G' },
      overrides: { gameDirectory: inst(version) } });
    if (!proc) throw new Error('Minecraft could not start. Press Logs for details.');
  } catch (e) { log(e.stack || e); throw e; }
});

ipcMain.handle('openlog', () => shell.openPath(path.join(ROOT, 'launcher.log')));
