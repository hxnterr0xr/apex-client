const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  versions: () => ipcRenderer.invoke('versions'),
  login: () => ipcRenderer.invoke('login'),
  search: (q) => ipcRenderer.invoke('search', q),
  install: (o) => ipcRenderer.invoke('install', o),
  launch: (o) => ipcRenderer.invoke('launch', o),
  win: (a) => ipcRenderer.send('win', a),
  on: (ch, fn) => ipcRenderer.on(ch, (_, d) => fn(d)),
});
