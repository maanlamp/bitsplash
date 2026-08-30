import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { type Plugin, defineConfig } from "vite";
import mkcert from "vite-plugin-mkcert";
import { inkCodegen } from "./src/engine/ink/ink-codegen-plugin";
import { viteDecorators } from "./vite-decorators";

const suppressSceneHmr = (): Plugin => ({
	name: "suppress-scene-hmr",
	handleHotUpdate(ctx) {
		if (ctx.file.endsWith(".scene.json")) {
			return [];
		}
	},
});

/**
 * The popout child page ({@link popout.html}) is served as raw bytes so Vite
 * never injects its HMR client into it — the child runs no app JS at all
 * (elements are created in the main document and adopted in). The cross-origin
 * isolation headers must be re-emitted here explicitly: a hand-written
 * middleware response bypasses Vite's `server.headers`, and without COOP
 * `same-origin` on the child the shared JS heap (live `window.opener`) dies
 * silently.
 */
const POPOUT_HTML = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Bitsplash Popout</title>
	</head>
	<body>
		<div id="popout-root"></div>
	</body>
</html>
`;

const servePopout = (): Plugin => ({
	name: "serve-popout",
	configureServer(server) {
		server.middlewares.use((req, res, next) => {
			if (req.url?.split("?")[0] !== "/popout.html") {
				next();
				return;
			}
			res.setHeader("Content-Type", "text/html; charset=utf-8");
			for (const [key, value] of Object.entries(
				CROSS_ORIGIN_ISOLATION,
			)) {
				res.setHeader(key, value);
			}
			res.end(POPOUT_HTML);
		});
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

export default defineConfig(() => ({
	plugins: [
		mkcert(),
		inkCodegen(),
		suppressSceneHmr(),
		servePopout(),
		// The React Compiler runs natively in Oxc, in dev and build alike, so
		// the two paths never diverge.
		react({ compiler: true }),
		// Only the filtered files ever reach Babel, so the cache wrapper only
		// hashes those; dev serves them warm, builds always run uncached.
		viteDecorators(),
	],
	assetsInclude: ["**/*.zip", "**/*.bsprite"],
	optimizeDeps: { exclude: ["@dimforge/rapier2d"] },
	server: {
		strictPort: true,
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
				popout: fileURLToPath(
					new URL("./popout.html", import.meta.url),
				),
			},
		},
	},
}));
