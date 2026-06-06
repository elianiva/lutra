import { defineConfig } from "oxlint";
import native from "oxlint-config-universe/native";

export default defineConfig({
	extends: [native],
	jsPlugins: [
		{
			name: "react-native",
			specifier: "oxlint-plugin-react-native",
		},
	],
	rules: {
		"curly": "off",
		"react-native/no-color-literals": "warn",
		"react-native/no-inline-styles": "warn",
		"react-native/no-raw-text": "warn",
		"react-native/no-single-element-style-arrays": "warn",
		"react-native/no-unused-styles": "warn",
		"react-native/sort-styles": "warn",
	},
});
