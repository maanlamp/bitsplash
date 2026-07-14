import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { type Plugin, defineConfig } from "vite";
import mkcert from "vite-plugin-mkcert";
import wasm from "vite-plugin-wasm";
import { inkCodegen } from "./src/engine/ink/ink-codegen-plugin";

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
		inkCodegen(),
		suppressSceneHmr(),
		react(),
		babel({
			plugins: [
				["@babel/plugin-proposal-decorators", { version: "2023-11" }],
			],
			overrides: [
				{
					exclude: /[\\/]src[\\/]engine[\\/]ui[\\/]/,
					presets: [reactCompilerPreset()],
				},
			],
		}),
	],
	assetsInclude: ["**/*.zip"],
	build: {
		target: "esnext",
		rollupOptions: {
			input: {
				editor: fileURLToPath(
					new URL("./index.html", import.meta.url),
				),
				game: fileURLToPath(new URL("./game.html", import.meta.url)),
			},
		},
	},
});
