'use strict';

const ALLOWED_PETS = new Set(['big', 'alien', 'minbird']);
const ALLOWED_SCALES = new Set([0.45, 0.6, 0.75, 0.9, 1.05]);

const DEFAULT_SETTINGS = Object.freeze({
  pet: 'big',
  scale: 0.75,
  alwaysOnTop: true,
  smartFollow: true,
  launchAtLogin: false,
  x: null,
  y: null
});

function normalizeSettings(value = {}) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    pet: ALLOWED_PETS.has(input.pet) ? input.pet : DEFAULT_SETTINGS.pet,
    scale: ALLOWED_SCALES.has(Number(input.scale))
      ? Number(input.scale)
      : DEFAULT_SETTINGS.scale,
    alwaysOnTop:
      typeof input.alwaysOnTop === 'boolean'
        ? input.alwaysOnTop
        : DEFAULT_SETTINGS.alwaysOnTop,
    smartFollow:
      typeof input.smartFollow === 'boolean'
        ? input.smartFollow
        : typeof input.autoRoam === 'boolean'
          ? input.autoRoam
          : DEFAULT_SETTINGS.smartFollow,
    launchAtLogin:
      typeof input.launchAtLogin === 'boolean'
        ? input.launchAtLogin
        : DEFAULT_SETTINGS.launchAtLogin,
    x: Number.isFinite(input.x) ? Math.round(input.x) : null,
    y: Number.isFinite(input.y) ? Math.round(input.y) : null
  };
}

module.exports = {
  ALLOWED_PETS,
  ALLOWED_SCALES,
  DEFAULT_SETTINGS,
  normalizeSettings
};
