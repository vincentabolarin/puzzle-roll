const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require("nativewind/metro");
const path = require('path');

const config = getDefaultConfig(__dirname);

// SVG support (modern approach)
config.resolver.assetExts = config.resolver.assetExts.filter(
  (ext) => ext !== 'svg'
);
config.resolver.sourceExts.push('svg');

// Monorepo support
config.watchFolders = [path.resolve(__dirname, '../..')];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '../..', 'node_modules'),
];

module.exports = withNativeWind(config, { input: "./global.css" });