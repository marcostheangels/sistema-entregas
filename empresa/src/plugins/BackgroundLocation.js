import { registerPlugin } from '@capacitor/core';

const LocationService = registerPlugin('LocationService');

export const backgroundLocation = {
  startService: (userId) => {
    return LocationService.startService({ userId });
  },
  stopService: () => {
    return LocationService.stopService();
  }
};
