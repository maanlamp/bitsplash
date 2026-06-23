import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { type Plugin, defineConfig } from "vite";
import mkcert from "vite-plugin-mkcert";
import wasm from "vite-plugin-wasm";

const suppressSceneHmr = (): Plugin => ({
	name: "suppress-scene-hmr",
	handleHotUpdate(ctx) {
		if (ctx.file.endsWith(".scene.json")) {
			return [];
		}
	},
});

export default defineConfig({
	plugins: [
		mkcert(),
		wasm(),
		suppressSceneHmr(),
		react(),
		babel({
			presets: [reactCompilerPreset()],
			plugins: [
				["@babel/plugin-proposal-decorators", { version: "2023-11" }],
			],
		}),
	],
	assetsInclude: ["**/*.zip"],
	build: { target: "esnext" },
});
