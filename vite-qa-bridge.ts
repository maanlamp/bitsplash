import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import {
	QA_CHANNEL,
	QA_ENDPOINT,
	type QaRequest,
	type QaResponse,
} from "./qa/qa-protocol";

const VIRTUAL_ID = "virtual:bitsplash-qa";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const REPLY_TIMEOUT_MS = 30_000;

const bridgeModule = (): string =>
	fileURLToPath(new URL("./qa/qa-bridge.ts", import.meta.url));

/**
 * The dev-only bridge between the running game and `scripts/probe.ts`.
 *
 * `apply: "serve"` is the never-ships guarantee, and it is structural rather
 * than a convention: a Vite plugin is build-time code, and this one is the only
 * thing that ever resolves {@link VIRTUAL_ID}. Under `vite build` — which
 * `bun game` runs — the probe is not in the module graph at all, so no app
 * module needs an `import.meta.env` guard and no bundle can carry the bridge.
 * Its page half lives in `qa/`, outside `src/`, so no app module can import it
 * either.
 *
 * The transport reuses Vite's own HMR socket rather than opening a port: the CLI
 * POSTs to {@link QA_ENDPOINT}, the plugin forwards over {@link QA_CHANNEL}, and
 * the page replies on the same channel.
 *
 * @example
 * plugins: [qaBridge()]
 */
export const qaBridge = (): Plugin => {
	let nextId = 1;
	const pending = new Map<number, (response: QaResponse) => void>();

	return {
		name: "bitsplash-qa-bridge",
		apply: "serve",

		resolveId(id) {
			return id === VIRTUAL_ID ? RESOLVED_ID : null;
		},

		load(id) {
			if (id !== RESOLVED_ID) {
				return null;
			}
			return `import ${JSON.stringify(bridgeModule())};`;
		},

		transform(code, id) {
			if (!id.endsWith("game-main.tsx")) {
				return null;
			}
			return {
				code: `import ${JSON.stringify(VIRTUAL_ID)};\n${code}`,
				map: null,
			};
		},

		configureServer(server) {
			server.ws.on(QA_CHANNEL, (response: QaResponse) => {
				const settle = pending.get(response.id);
				if (settle) {
					pending.delete(response.id);
					settle(response);
				}
			});

			server.middlewares.use((req, res, next) => {
				if (req.url?.split("?")[0] !== QA_ENDPOINT) {
					next();
					return;
				}
				const chunks: Array<Buffer> = [];
				req.on("data", (chunk: Buffer) => chunks.push(chunk));
				req.on("end", () => {
					let request: QaRequest;
					try {
						request = {
							...JSON.parse(Buffer.concat(chunks).toString()),
							id: nextId++,
						} as QaRequest;
					} catch {
						res.statusCode = 400;
						res.end('{"error":"malformed request"}');
						return;
					}
					const timer = setTimeout(() => {
						pending.delete(request.id);
						res.statusCode = 504;
						res.end(
							JSON.stringify({
								error:
									"the game did not answer. Is a game window open on this dev server, and is it visible? Frame-driven commands need frames, and Chromium throttles requestAnimationFrame in a backgrounded window.",
							}),
						);
					}, REPLY_TIMEOUT_MS);
					pending.set(request.id, (response) => {
						clearTimeout(timer);
						res.setHeader("content-type", "application/json");
						res.end(JSON.stringify(response));
					});
					server.ws.send(QA_CHANNEL, request);
				});
			});
		},
	};
};
