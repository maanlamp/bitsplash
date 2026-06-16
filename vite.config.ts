import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { type Plugin, defineConfig } from "vite";

const LEVELS_DIR = fileURLToPath(
	new URL("./src/game/levels", import.meta.url),
);

const liveSaveLevel = (): Plugin => ({
	name: "live-save-level",
	handleHotUpdate(ctx) {
		if (ctx.file.endsWith(".scene.json")) {
			return [];
		}
	},
	configureServer(server) {
		server.middlewares.use("/__save-level", (req, res) => {
			if (req.method !== "POST") {
				res.statusCode = 405;
				res.end();
				return;
			}
			const sceneId = req.headers["x-scene-id"];
			const id =
				typeof sceneId === "string" && /^[\w-]+$/.test(sceneId)
					? sceneId
					: "demo";
			const path = `${LEVELS_DIR}/${id}.scene.json`;
			let body = "";
			req.on("data", (chunk) => {
				body += chunk;
			});
			req.on("end", () => {
				writeFile(path, body).then(
					() => {
						server.config.logger.info(
							`[live-save] wrote ${id}.scene.json`,
						);
						res.statusCode = 204;
						res.end();
					},
					(error) => {
						server.config.logger.error(
							`[live-save] ${String(error)}`,
						);
						res.statusCode = 500;
						res.end();
					},
				);
			});
		});
	},
});

const ASSETS_PATH = fileURLToPath(
	new URL("./src/game/assets", import.meta.url),
);

export const liveUploadAsset = (): Plugin => ({
	name: "live-upload-asset",
	configureServer(server) {
		server.middlewares.use("/__upload-asset", (req, res) => {
			if (req.method !== "POST") {
				res.statusCode = 405;
				res.end();
				return;
			}
			const chunks: Buffer[] = [];
			req.on("data", (chunk) => chunks.push(chunk));
			req.on("end", () => {
				const filename = req.headers["x-filename"];
				if (!filename || typeof filename !== "string") {
					res.statusCode = 400;
					res.end();
					return;
				}
				const safe = basename(filename);
				const dest = `${ASSETS_PATH}/${safe}`;
				const overwrite = req.headers["x-overwrite"] === "true";
				if (existsSync(dest) && !overwrite) {
					server.config.logger.info(
						`[live-upload] "${dest}" already exists, skipping...`,
					);
					res.statusCode = 304;
					res.setHeader("Content-Type", "application/json");
					res.end(
						JSON.stringify({ url: `/src/game/assets/${safe}` }),
					);
				} else {
					writeFile(dest, Buffer.concat(chunks)).then(
						() => {
							server.config.logger.info(
								`[live-upload] wrote ${safe}`,
							);
							res.statusCode = 200;
							res.setHeader("Content-Type", "application/json");
							res.end(
								JSON.stringify({ url: `/src/game/assets/${safe}` }),
							);
						},
						(error) => {
							server.config.logger.error(
								`[live-upload] ${String(error)}`,
							);
							res.statusCode = 500;
							res.end();
						},
					);
				}
			});
		});
	},
});

export default defineConfig({
	plugins: [
		liveSaveLevel(),
		liveUploadAsset(),
		react(),
		babel({
			presets: [reactCompilerPreset()],
			plugins: [
				["@babel/plugin-proposal-decorators", { version: "2023-11" }],
			],
		}),
	],
	assetsInclude: ["**/*.zip"],
	server: {
		open: true,
	},
});
