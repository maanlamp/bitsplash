import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { type Plugin, defineConfig } from "vite";
import mkcert from "vite-plugin-mkcert";
import { inkCodegen } from "./src/engine/ink/ink-codegen-plugin";
import { cachedBabel } from "./vite-babel-cache";

/**
 * Babel is the slow, single-threaded pass on the dev hot path: it runs the
 * `2023-11` decorator transform (Oxc can't do standard decorators) plus the
 * React Compiler. Options are shared between dev and build; only dev wraps them
 * in {@link cachedBabel} (see below).
 */
const babelOptions: Parameters<typeof babel>[0] = {
	plugins: [
		["@babel/plugin-proposal-decorators", { version: "2023-11" }],
	],
	overrides: [
		{
			exclude: /[\\/]src[\\/]engine[\\/]ui[\\/]/,
			presets: [reactCompilerPreset()],
		},
	],
};

const suppressSceneHmr = (): Plugin => ({
	name: "suppress-scene-hmr",
	handleHotUpdate(ctx) {
		if (ctx.file.endsWith(".scene.json")) {
			return [];
		}
	},
});

/**
 * Cross-origin isolation for the dev server. With COOP `same-origin` + COEP
 * `credentialless` the page becomes `crossOriginIsolated`, which drops
 * `performance.now()` resolution from Chromium's 100µs clamp to 5µs — the finer
 * timer the per-system profiler wants. `credentialless` (over `require-corp`) is
 * chosen so cross-origin subresources need no `Cross-Origin-Resource-Policy`
 * header, keeping the invasive blast radius small; all app assets are
 * same-origin anyway.
 */
const CROSS_ORIGIN_ISOLATION = {
	"Cross-Origin-Opener-Policy": "same-origin",
	"Cross-Origin-Embedder-Policy": "credentialless",
};

export default defineConfig(({ command }) => ({
	plugins: [
		mkcert(),
		inkCodegen(),
		suppressSceneHmr(),
		react(),
		// Dev serves warm from an on-disk transform cache; production builds run
		// Babel straight (uncached) so shipped output is never cache-dependent.
		command === "serve"
			? cachedBabel(babelOptions)
			: babel(babelOptions),
	],
	assetsInclude: ["**/*.zip"],
	optimizeDeps: {
		include: [
			"@base-ui/react/alert-dialog",
			"@base-ui/react/autocomplete",
			"@base-ui/react/button",
			"@base-ui/react/checkbox",
			"@base-ui/react/context-menu",
			"@base-ui/react/dialog",
			"@base-ui/react/field",
			"@base-ui/react/fieldset",
			"@base-ui/react/input",
			"@base-ui/react/number-field",
			"@base-ui/react/popover",
			"@base-ui/react/select",
			"@base-ui/react/toast",
			"@base-ui/react/toggle",
			"@base-ui/react/toggle-group",
			"@base-ui/react/tooltip",
			"@base-ui/react/use-render",
			"@number-flow/react",
			"@phosphor-icons/react",
			"colorjs.io",
			"inkjs/full",
			"motion/react",
			"react-aria-components",
		],
	},
	server: {
		headers: CROSS_ORIGIN_ISOLATION,
		warmup: {
			clientFiles: ["./src/main.tsx", "./src/game-main.tsx"],
		},
	},
	preview: { headers: CROSS_ORIGIN_ISOLATION },
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
}));
