const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const config = getDefaultConfig(__dirname);

// Reanimated 4.4 throws on eager load because worklets' top-level init()
// reads globals that aren't set up until after the native module is ready.
// Defer the worklets/reanimated import graph behind actual usage.
// https://github.com/software-mansion/react-native-reanimated/issues/9445
config.transformer.getTransformOptions = async () => ({
  transform: {
    inlineRequires: true,
  },
});

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
});
