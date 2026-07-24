const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('recruitingApi', {
  getData: () => ipcRenderer.invoke('recruiting:get-data'),
  getRawTable: (key) => ipcRenderer.invoke('recruiting:get-raw-table', key),
  openCsv: () => ipcRenderer.invoke('recruiting:open-csv'),
  openReport: () => ipcRenderer.invoke('recruiting:open-report'),
  writeReport: (metadata) => ipcRenderer.invoke('recruiting:write-report', metadata),
  showDataFile: () => ipcRenderer.invoke('recruiting:show-data-file'),
  selectDynastyFolder: (defaultPath) => ipcRenderer.invoke('recruiting:select-dynasty-folder', defaultPath),
  listDynastyFolder: (folderPath) => ipcRenderer.invoke('recruiting:list-dynasty-folder', folderPath),
  loadDynastyFile: (filePath) => ipcRenderer.invoke('recruiting:load-dynasty-file', filePath),
  savePreviewChanges: (payload) => ipcRenderer.invoke('recruiting:save-preview-changes', payload),
  onLoadProgress: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('recruiting:load-progress', listener);
    return () => ipcRenderer.removeListener('recruiting:load-progress', listener);
  },
  rebuildData: () => ipcRenderer.invoke('recruiting:rebuild-data'),
  getSkinToneSettings: () => ipcRenderer.invoke('recruiting:get-skin-tone-settings'),
  saveSkinToneSettings: (settings) => ipcRenderer.invoke('recruiting:save-skin-tone-settings', settings),
  getNameWeights: () => ipcRenderer.invoke('recruiting:get-name-weights'),
  saveNameWeights: (payload) => ipcRenderer.invoke('recruiting:save-name-weights', payload),
  getOvrWeights: () => ipcRenderer.invoke('recruiting:get-ovr-weights'),
  getPortraitManifest: () => ipcRenderer.invoke('recruiting:get-portrait-manifest'),
  exportSettingsConfig: (payload) => ipcRenderer.invoke('recruiting:export-settings-config', payload),
  importSettingsConfig: () => ipcRenderer.invoke('recruiting:import-settings-config')
});
