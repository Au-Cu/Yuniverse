'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petApi', {
  getState: () => ipcRenderer.invoke('pet:get-state'),
  getCursor: () => ipcRenderer.invoke('pet:get-cursor'),
  stepMove: (dx, dy) => ipcRenderer.invoke('pet:step-move', { dx, dy }),
  dragTo: (x, y) => ipcRenderer.send('pet:drag-to', { x, y }),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  setClickThrough: (enabled) => ipcRenderer.send('pet:set-click-through', Boolean(enabled)),
  showMenu: () => ipcRenderer.send('pet:show-menu'),
  togglePet: () => ipcRenderer.send('pet:toggle-pet'),
  onSettings: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('pet:settings', handler);
    return () => ipcRenderer.removeListener('pet:settings', handler);
  },
  onAction: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('pet:action', handler);
    return () => ipcRenderer.removeListener('pet:action', handler);
  }
});
