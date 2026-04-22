/** @type {import('@babel/core').TransformOptions} */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      /**
       * babel-preset-expo handles everything for SDK 55:
       * - JSX transform via jsxImportSource: 'nativewind' (NativeWind v4 className support)
       * - Expo Router v4 transforms (expo-router/babel is gone, merged here in SDK 53+)
       * - Reanimated 4 worklet support (react-native-reanimated/plugin is gone, merged here in v4)
       * - TypeScript, Flow stripping
       *
       * Do NOT add:
       * - 'nativewind/babel' preset — jsxImportSource already handles this
       * - 'expo-router/babel' plugin — removed in Router v4 / SDK 53
       * - 'react-native-reanimated/plugin' — removed in Reanimated v4
       */
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
    ],
  };
};