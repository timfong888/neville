// The native app imports platform-neutral modules from the repo root (lib/).
// Metro must watch the root, and every package must resolve from native/node_modules
// only, so React and React Native are never loaded twice (the website pins a different React).
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const root = path.resolve(__dirname, "..");
const config = getDefaultConfig(__dirname);

config.watchFolders = [root];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
