import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'vp_settings';

const DEFAULTS = {
  // video
  videoDeviceId: '',
  videoResolution: '1280x720',
  // audio
  audioInputId: '',
  audioOutputId: '',
  inputVolume: 100,
  outputVolume: 100,
  // notifications
  messageSound: true,
  desktopNotifications: false,
  // appearance
  theme: 'dark',
  fontSize: 'medium',
  // privacy
  showOnlineStatus: true,
  allowDmFromAll: true,
  // keybinds
  pushToTalkKey: 'V',
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save settings', e);
  }
}

export function useSettingsStorage() {
  const [settings, setSettings] = useState(load);

  useEffect(() => {
    const stored = load();
    setSettings(stored);
  }, []);

  const update = useCallback((partial) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      save(next);
      return next;
    });
  }, []);

  // Apply theme and font size to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    const sizeMap = { small: '13px', medium: '14px', large: '15px' };
    document.body.style.fontSize = sizeMap[settings.fontSize] || sizeMap.medium;
  }, [settings.theme, settings.fontSize]);

  return [settings, update];
}

export function getStoredSettings() {
  return load();
}

export function applyStoredThemeAndFont() {
  const s = load();
  document.documentElement.setAttribute('data-theme', s.theme);
  const sizeMap = { small: '13px', medium: '14px', large: '15px' };
  document.body.style.fontSize = sizeMap[s.fontSize] || sizeMap.medium;
}
