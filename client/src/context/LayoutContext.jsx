import { createContext, useContext } from 'react';
import { User, Video, Mic, Bell, Palette, Shield, Keyboard } from 'lucide-react';

const ServersContext = createContext(null);
export function useServers() {
  return useContext(ServersContext);
}

const SidebarTabContext = createContext('servers');
export function useSidebarTab() {
  return useContext(SidebarTabContext);
}

const SettingsCategoryContext = createContext({ category: 'account', setCategory: () => {} });
export function useSettingsCategory() {
  return useContext(SettingsCategoryContext);
}

export const SETTINGS_CATEGORIES = [
  { id: 'account', label: 'Аккаунт', icon: User },
  { id: 'video', label: 'Видео', icon: Video },
  { id: 'audio', label: 'Аудио', icon: Mic },
  { id: 'notifications', label: 'Уведомления', icon: Bell },
  { id: 'appearance', label: 'Внешний вид', icon: Palette },
  { id: 'privacy', label: 'Приватность', icon: Shield },
  { id: 'keybinds', label: 'Горячие клавиши', icon: Keyboard },
];

export { ServersContext, SidebarTabContext, SettingsCategoryContext };
