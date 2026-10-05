'use strict';

const { app, BrowserWindow, ipcMain, Menu, nativeImage, powerMonitor, screen, Tray } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeSettings } = require('./shared/settings');

const CELL_WIDTH = 192;
const CELL_HEIGHT = 208;
const APP_ID = 'cn.justcats.desktop.pet';
const SMOKE_TEST = process.argv.includes('--smoke-test') || process.env.JUST_PET_SMOKE_TEST === '1';
const APP_DATA_ROOT = app.getPath('appData');
const LEGACY_USER_DATA_PATHS = Object.freeze([
  path.join(APP_DATA_ROOT, 'JUSTPet'),
  path.join(APP_DATA_ROOT, 'just-cats-desktop-pet'),
  path.join(APP_DATA_ROOT, 'JUST双猫桌宠')
]);
app.setPath('userData', path.join(APP_DATA_ROOT, SMOKE_TEST ? 'Yuniverse-Smoke' : 'Yuniverse'));
const PET_SEQUENCE = Object.freeze(['big', 'alien', 'minbird']);
const PET_NAMES = Object.freeze({
  big: 'JUST大猫',
  alien: 'JUST外星猫',
  minbird: '珉鸟'
});

let petWindow = null;
let tray = null;
let settings = normalizeSettings();
let settingsPath = null;
let saveTimer = null;
let isQuitting = false;

if (!SMOKE_TEST && !app.requestSingleInstanceLock()) {
  app.quit();
}

app.setAppUserModelId(APP_ID);

function dimensionsForScale(scale) {
  return {
    width: Math.round(CELL_WIDTH * scale),
    height: Math.round(CELL_HEIGHT * scale)
  };
}

function loadSettings() {
  settingsPath = path.join(app.getPath('userData'), 'settings.json');
  try {
    const loadPath = [
      settingsPath,
      ...LEGACY_USER_DATA_PATHS.map((directory) => path.join(directory, 'settings.json'))
    ].find((candidate) => fs.existsSync(candidate)) || settingsPath;
    settings = normalizeSettings(JSON.parse(fs.readFileSync(loadPath, 'utf8')));
    if (loadPath !== settingsPath) saveSettingsNow();
  } catch {
    settings = normalizeSettings();
  }
  if (SMOKE_TEST && PET_SEQUENCE.includes(process.env.JUST_PET_SMOKE_PET)) {
    settings = normalizeSettings({ ...settings, pet: process.env.JUST_PET_SMOKE_PET });
  }
}

function saveSettingsNow() {
  if (!settingsPath) return;
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  } catch (error) {
    console.error('Unable to save settings:', error);
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSettingsNow, 450);
}

function clampToWorkArea(x, y, width, height) {
  const display = screen.getDisplayNearestPoint({
    x: Math.round(x + width / 2),
    y: Math.round(y + height / 2)
  });
  const area = display.workArea;
  return {
    x: Math.min(Math.max(Math.round(x), area.x), area.x + area.width - width),
    y: Math.min(Math.max(Math.round(y), area.y), area.y + area.height - height),
    workArea: area
  };
}

function getInitialBounds() {
  const size = dimensionsForScale(settings.scale);
  if (Number.isFinite(settings.x) && Number.isFinite(settings.y)) {
    return { ...size, ...clampToWorkArea(settings.x, settings.y, size.width, size.height) };
  }

  const area = screen.getPrimaryDisplay().workArea;
  return {
    ...size,
    x: area.x + area.width - size.width - 22,
    y: area.y + area.height - size.height - 10,
    workArea: area
  };
}

function publicSettings() {
  const smokeLookIndex = Number.parseInt(process.env.JUST_PET_SMOKE_LOOK_INDEX, 10);
  return {
    pet: settings.pet,
    scale: settings.scale,
    alwaysOnTop: settings.alwaysOnTop,
    smartFollow: settings.smartFollow,
    launchAtLogin: settings.launchAtLogin,
    isPackaged: app.isPackaged,
    smokeLookIndex: SMOKE_TEST && Number.isInteger(smokeLookIndex)
      && smokeLookIndex >= 0 && smokeLookIndex <= 15
      ? smokeLookIndex
      : null
  };
}

function sendSettings() {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet:settings', publicSettings());
  }
}

function updateTrayMenu() {
  if (tray && !tray.isDestroyed()) {
    tray.setContextMenu(buildContextMenu());
    tray.setToolTip(`Yuniverse · ${PET_NAMES[settings.pet]}`);
  }
}

function applySettings(patch) {
  settings = normalizeSettings({ ...settings, ...patch });
  scheduleSave();
  sendSettings();
  updateTrayMenu();
}

function setPet(pet) {
  applySettings({ pet });
}

function sendAction(action) {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (!petWindow.isVisible()) petWindow.showInactive();
  petWindow.webContents.send('pet:action', action);
}

function setScale(scale) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const oldBounds = petWindow.getBounds();
  const nextSize = dimensionsForScale(scale);
  const target = clampToWorkArea(
    oldBounds.x + Math.round((oldBounds.width - nextSize.width) / 2),
    oldBounds.y + oldBounds.height - nextSize.height,
    nextSize.width,
    nextSize.height
  );
  petWindow.setBounds({
    x: target.x,
    y: target.y,
    width: nextSize.width,
    height: nextSize.height
  });
  applySettings({ scale, x: target.x, y: target.y });
}

function setAlwaysOnTop(enabled) {
  petWindow?.setAlwaysOnTop(enabled, enabled ? 'floating' : 'normal');
  applySettings({ alwaysOnTop: enabled });
}

function startupExecutablePath() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function setLaunchAtLogin(enabled) {
  if (!app.isPackaged) return;
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: startupExecutablePath(),
      args: []
    });
    applySettings({ launchAtLogin: enabled });
  } catch (error) {
    console.error('Unable to update login item:', error);
  }
}

function toggleVisibility() {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (petWindow.isVisible()) {
    petWindow.hide();
  } else {
    petWindow.showInactive();
  }
  updateTrayMenu();
}

function quitApp() {
  isQuitting = true;
  saveSettingsNow();
  app.quit();
}

function buildContextMenu() {
  const visible = Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible());
  return Menu.buildFromTemplate([
    {
      label: '切换成员',
      submenu: [
        { label: 'JUST大猫', type: 'radio', checked: settings.pet === 'big', click: () => setPet('big') },
        { label: 'JUST外星猫', type: 'radio', checked: settings.pet === 'alien', click: () => setPet('alien') },
        { label: '珉鸟', type: 'radio', checked: settings.pet === 'minbird', click: () => setPet('minbird') }
      ]
    },
    {
      label: '和它互动',
      submenu: [
        { label: '招招手', click: () => sendAction('waving') },
        { label: '坐下 / 闭眼休息', click: () => sendAction('sitting') },
        { label: '睡觉', click: () => sendAction('sleeping') }
      ]
    },
    { type: 'separator' },
    {
      label: '智能跟随',
      type: 'checkbox',
      checked: settings.smartFollow,
      click: (item) => applySettings({ smartFollow: item.checked })
    },
    {
      label: '总在最前',
      type: 'checkbox',
      checked: settings.alwaysOnTop,
      click: (item) => setAlwaysOnTop(item.checked)
    },
    {
      label: '大小',
      submenu: [
        { label: '极小（45%）', type: 'radio', checked: settings.scale === 0.45, click: () => setScale(0.45) },
        { label: '小（60%）', type: 'radio', checked: settings.scale === 0.6, click: () => setScale(0.6) },
        { label: '原始（75%）', type: 'radio', checked: settings.scale === 0.75, click: () => setScale(0.75) },
        { label: '大（90%）', type: 'radio', checked: settings.scale === 0.9, click: () => setScale(0.9) },
        { label: '超大（105%）', type: 'radio', checked: settings.scale === 1.05, click: () => setScale(1.05) }
      ]
    },
    {
      label: app.isPackaged ? '开机自动启动' : '开机自动启动（打包后可用）',
      type: 'checkbox',
      checked: settings.launchAtLogin,
      enabled: app.isPackaged,
      click: (item) => setLaunchAtLogin(item.checked)
    },
    { type: 'separator' },
    { label: visible ? '隐藏桌宠' : '显示桌宠', click: toggleVisibility },
    { label: '退出', click: quitApp }
  ]);
}

function createTrayIcon() {
  const sourcePath = path.join(__dirname, '..', 'assets', 'just-big-cat.png');
  const sheet = nativeImage.createFromPath(sourcePath);
  if (sheet.isEmpty()) return nativeImage.createEmpty();
  return sheet
    .crop({ x: 0, y: 0, width: CELL_WIDTH, height: CELL_HEIGHT })
    .resize({ width: 24, height: 26, quality: 'best' });
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.on('click', toggleVisibility);
  updateTrayMenu();
}

function createWindow() {
  const initial = getInitialBounds();
  petWindow = new BrowserWindow({
    x: initial.x,
    y: initial.y,
    width: initial.width,
    height: initial.height,
    useContentSize: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    hasShadow: false,
    roundedCorners: false,
    skipTaskbar: true,
    alwaysOnTop: settings.alwaysOnTop,
    show: false,
    title: 'Yuniverse',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false
    }
  });

  petWindow.setMenuBarVisibility(false);
  petWindow.setAlwaysOnTop(settings.alwaysOnTop, settings.alwaysOnTop ? 'floating' : 'normal');
  petWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (SMOKE_TEST) {
    petWindow.webContents.once('did-finish-load', () => {
      const smokeAction = process.env.JUST_PET_SMOKE_ACTION;
      if (smokeAction) setTimeout(() => sendAction(smokeAction), 250);
      const requestedDelay = Number.parseInt(process.env.JUST_PET_SMOKE_DELAY_MS, 10);
      const smokeDelay = Number.isFinite(requestedDelay) && requestedDelay >= 500
        ? requestedDelay
        : 1300;
      setTimeout(async () => {
        try {
          const renderer = await petWindow.webContents.executeJavaScript(`(() => {
            const canvas = document.getElementById('pet');
            const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let visiblePixels = 0;
            for (let index = 3; index < data.length; index += 4) {
              if (data[index] > 0) visiblePixels += 1;
            }
            return {
              width: canvas.width,
              height: canvas.height,
              visiblePixels,
              debug: globalThis.__petDebugSnapshot?.() ?? null
            };
          })()`);
          const capture = await petWindow.capturePage();
          const output = process.env.JUST_PET_SMOKE_OUTPUT || path.join(app.getPath('temp'), 'just-cats-smoke.png');
          const reportPath = output.replace(/\.png$/i, '.json');
          fs.mkdirSync(path.dirname(output), { recursive: true });
          fs.writeFileSync(output, capture.toPNG());
          fs.writeFileSync(
            reportPath,
            `${JSON.stringify({ ok: renderer.visiblePixels > 0, renderer, window: petWindow.getBounds() }, null, 2)}\n`,
            'utf8'
          );
          console.log(`SMOKE_OK ${output}`);
          isQuitting = true;
          app.quit();
        } catch (error) {
          console.error('SMOKE_FAILED', error);
          isQuitting = true;
          app.exit(1);
        }
      }, smokeDelay);
    });
  }

  petWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  petWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  petWindow.once('ready-to-show', () => petWindow?.showInactive());
  petWindow.on('move', () => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const bounds = petWindow.getBounds();
    settings.x = bounds.x;
    settings.y = bounds.y;
    scheduleSave();
  });
  petWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      petWindow.hide();
      updateTrayMenu();
    }
  });
  petWindow.on('closed', () => {
    petWindow = null;
  });
}

function registerIpc() {
  ipcMain.handle('pet:get-state', () => {
    const bounds = petWindow?.getBounds();
    const area = bounds
      ? screen.getDisplayMatching(bounds).workArea
      : screen.getPrimaryDisplay().workArea;
    return { settings: publicSettings(), bounds, workArea: area };
  });

  ipcMain.handle('pet:get-cursor', () => {
    if (!petWindow || petWindow.isDestroyed()) return null;
    const bounds = petWindow.getBounds();
    const realCursor = screen.getCursorScreenPoint();
    const smokeCursorX = Number.parseInt(process.env.JUST_PET_SMOKE_CURSOR_X, 10);
    const smokeCursorY = Number.parseInt(process.env.JUST_PET_SMOKE_CURSOR_Y, 10);
    const smokeIdleSeconds = Number.parseInt(process.env.JUST_PET_SMOKE_IDLE_SECONDS, 10);
    return {
      cursor: {
        x: SMOKE_TEST && Number.isFinite(smokeCursorX) ? smokeCursorX : realCursor.x,
        y: SMOKE_TEST && Number.isFinite(smokeCursorY) ? smokeCursorY : realCursor.y
      },
      bounds,
      workArea: screen.getDisplayMatching(bounds).workArea,
      idleSeconds: SMOKE_TEST && Number.isFinite(smokeIdleSeconds)
        ? Math.max(0, smokeIdleSeconds)
        : powerMonitor.getSystemIdleTime()
    };
  });

  ipcMain.handle('pet:step-move', (_event, delta = {}) => {
    if (!petWindow || petWindow.isDestroyed()) return { movedX: 0, movedY: 0, hitBoundary: true };
    const bounds = petWindow.getBounds();
    const dx = Number.isFinite(delta.dx) ? delta.dx : 0;
    const dy = Number.isFinite(delta.dy) ? delta.dy : 0;
    const target = clampToWorkArea(bounds.x + dx, bounds.y + dy, bounds.width, bounds.height);
    petWindow.setPosition(target.x, target.y);
    return {
      movedX: target.x - bounds.x,
      movedY: target.y - bounds.y,
      hitBoundary: (dx !== 0 && target.x === bounds.x) || (dy !== 0 && target.y === bounds.y),
      bounds: petWindow.getBounds()
    };
  });

  ipcMain.on('pet:drag-to', (_event, point = {}) => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const bounds = petWindow.getBounds();
    const x = Number.isFinite(point.x) ? point.x : bounds.x;
    const y = Number.isFinite(point.y) ? point.y : bounds.y;
    const target = clampToWorkArea(x, y, bounds.width, bounds.height);
    petWindow.setPosition(target.x, target.y);
  });

  ipcMain.on('pet:drag-end', () => saveSettingsNow());
  ipcMain.on('pet:set-click-through', (_event, enabled) => {
    if (!petWindow || petWindow.isDestroyed()) return;
    if (enabled) petWindow.setIgnoreMouseEvents(true, { forward: true });
    else petWindow.setIgnoreMouseEvents(false);
  });
  ipcMain.on('pet:show-menu', () => {
    if (!petWindow || petWindow.isDestroyed()) return;
    petWindow.setIgnoreMouseEvents(false);
    buildContextMenu().popup({ window: petWindow });
  });
  ipcMain.on('pet:toggle-pet', () => {
    const current = PET_SEQUENCE.indexOf(settings.pet);
    setPet(PET_SEQUENCE[(current + 1) % PET_SEQUENCE.length]);
  });
}

function ensureWindowOnScreen() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const bounds = petWindow.getBounds();
  const target = clampToWorkArea(bounds.x, bounds.y, bounds.width, bounds.height);
  petWindow.setPosition(target.x, target.y);
}

app.on('second-instance', () => {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.showInactive();
});

app.on('before-quit', () => {
  isQuitting = true;
  saveSettingsNow();
});

app.on('window-all-closed', () => {
  if (isQuitting) app.quit();
});

app.whenReady().then(() => {
  loadSettings();
  registerIpc();
  createWindow();
  if (!SMOKE_TEST) createTray();
  screen.on('display-removed', ensureWindowOnScreen);
  screen.on('display-metrics-changed', ensureWindowOnScreen);
});
