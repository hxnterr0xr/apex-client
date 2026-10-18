const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  versions: () => ipcRenderer.invoke('versions'),
  openlog: () => ipcRenderer.invoke('openlog'),
  autologin: () => ipcRenderer.invoke('autologin'),
  logout: () => ipcRenderer.invoke('logout'),
  login: () => ipcRenderer.invoke('login'),
  search: (q) => ipcRenderer.invoke('search', q),
  install: (o) => ipcRenderer.invoke('install', o),
  launch: (o) => ipcRenderer.invoke('launch', o),
  win: (a) => ipcRenderer.send('win', a),
  on: (ch, fn) => ipcRenderer.on(ch, (_, d) => fn(d)),
});
