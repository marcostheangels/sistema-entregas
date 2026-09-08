import { registerPlugin } from '@capacitor/core';

const Plugin = registerPlugin('AppSettingsPlugin');

const AppSettings = {
  checkPermissions: () => Plugin.checkPermissions(),

  openLocationSettings: () => Plugin.openLocationSettings(),

  openAppSettings: () => Plugin.openAppSettings(),

  openNotificationSettings: () => Plugin.openNotificationSettings(),

  openBatterySettings: () => Plugin.openBatterySettings(),

  openAutoStartSettings: () => Plugin.openAutoStartSettings(),

  openOverlaySettings: () => Plugin.openOverlaySettings(),

  openAccessibilitySettings: () => Plugin.openAccessibilitySettings(),

  requestIgnoreBatteryOptimization: () => Plugin.requestIgnoreBatteryOptimization()
};

export default AppSettings;