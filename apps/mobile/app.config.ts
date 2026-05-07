import 'dotenv/config';
import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Puzzle Roll',
  slug: 'puzzle-roll',
  version: '1.0.0',

  orientation: 'portrait',
  icon: './assets/icon.png',

  userInterfaceStyle: 'dark',
  backgroundColor: '#060818',

  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#060818',
  },

  assetBundlePatterns: ['**/*'],

  scheme: 'puzzleroll',

  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.puzzleroll.puzzleroll',
    buildNumber: '1',

    // Optional later if you add Firebase iOS
    // googleServicesFile: process.env.GOOGLE_SERVICES_PLIST,
  },

  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#060818',
    },

    package: 'com.puzzleroll.puzzleroll',
    versionCode: 1,

    googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
  },

  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/favicon.png',
  },

  plugins: [
    'expo-router',
    'expo-secure-store',

    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#6366f1',
        sounds: [],
      },
    ],

    'expo-font',
    'expo-audio',

    // react-native-google-mobile-ads config
    [
      'react-native-google-mobile-ads',
      {
        androidAppId: process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID,
        iosAppId: process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID,
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
  },

  extra: {
    router: {},

    eas: {
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
    },
  },

  owner: 'vincentabolarin',  
};

export default config;