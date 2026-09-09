const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

const APP_URL = 'https://marcostheangels.github.io/sistema-entregas/empresa/';
const OFFLINE_FILE = 'file://' + path.join(__dirname, 'offline.html');

let mainWindow = null;

function janelaOffline(win) {
  win.loadURL(OFFLINE_FILE);
}

function criarJanela() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#101828',
    title: 'ConectaEntregas Empresas',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  Menu.setApplicationMenu(null);

  // F5 / Ctrl+R recarregam o painel
  mainWindow.webContents.on('before-input-event', (e, input) => {
    const recarregar = (input.type === 'keyDown') && (
      input.key === 'F5' ||
      ((input.control || input.meta) && input.key.toLowerCase() === 'r')
    );
    if (recarregar) {
      e.preventDefault();
      mainWindow.loadURL(APP_URL).catch(() => janelaOffline(mainWindow));
    }
  });

  // Links externos (Google Maps, Waze, WhatsApp) abrem no navegador padrao
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(APP_URL).catch(() => janelaOffline(mainWindow));

  mainWindow.on('did-fail-load', (e, codigo, desc, url, ehPrincipal) => {
    if (ehPrincipal && codigo !== -3) janelaOffline(mainWindow);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(criarJanela);

app.on('window-all-closed', () => {
  app.quit();
});
