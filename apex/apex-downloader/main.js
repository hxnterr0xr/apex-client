// latest.json format: { "version": "1.0.0", "url": "https://YOUR-SITE.com/apex/ApexClient-Setup.exe", "sha256": "..." }
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawn } = require('child_process');
const cfg = require('./config.json');
let win;
const say = (t, p) => win.webContents.send('s', { t, p });

app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 420, height: 220, frame: false, icon: path.join(__dirname,'icon.ico'), resizable: false, backgroundColor: '#0d0b14',
    webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  await win.loadFile('index.html');
  try {
    say('Checking for the latest version…');
    const meta = await (await fetch(cfg.updateUrl)).json();
    const res = await fetch(meta.url);
    const total = +res.headers.get('content-length') || 0, chunks = []; let got = 0;
    for await (const c of res.body) { chunks.push(c); got += c.length; if (total) say(`Downloading Apex Client ${meta.version}`, got / total); }
    const buf = Buffer.concat(chunks);
    if (meta.sha256 && crypto.createHash('sha256').update(buf).digest('hex') !== meta.sha256) throw new Error('Download is corrupted. Try again.');
    const file = path.join(app.getPath('temp'), 'ApexClient-Setup.exe');
    fs.writeFileSync(file, buf);
    say('Installing…', 1);
    spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 1500);
  } catch (e) { say('Failed: ' + e.message + ' — check your connection and reopen.'); }
});
