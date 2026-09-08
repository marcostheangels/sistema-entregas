import { registerPlugin } from '@capacitor/core';

const LocationService = registerPlugin('LocationService');

export const backgroundLocation = {
  startService: (userId) => {
    console.log('BackgroundLocation: Starting service for user:', userId);
    return LocationService.startService({ userId });
  },
  stopService: () => {
    console.log('BackgroundLocation: Stopping service');
    return LocationService.stopService();
  }
};
