const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', { on: fn => ipcRenderer.on('s', (_, d) => fn(d)) });
