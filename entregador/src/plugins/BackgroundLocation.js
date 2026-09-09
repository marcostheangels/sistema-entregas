import { registerPlugin } from '@capacitor/core';

const LocationService = registerPlugin('LocationService');

export const backgroundLocation = {
  startService: (userId, email = '', senha = '') => {
    console.log('BackgroundLocation: Starting service for user:', userId);
    return LocationService.startService({ userId, email, senha });
  },
  stopService: () => {
    console.log('BackgroundLocation: Stopping service');
    return LocationService.stopService();
  }
};
