import { Glob } from "bun";
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type AudioManager from "../src/engine/audio/audio";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import { NULL_ACTIONS } from "../src/engine/input/bindings/action-provider";
import type { SettingsStore } from "../src/engine/input/settings-store";
import type { AuthoredScene } from "../src/engine/runtime/game-module";
import type { SceneDefinition } from "../src/engine/runtime/runtime";
import {
	type SceneFile,
	toSceneConfig,
} from "../src/engine/scene/scene";
import Vector2 from "../src/engine/vector2";
import { collisionMatrix } from "../src/game/collision";
import { game as gameComposition } from "../src/game/compositions";
import { EnemyBrainComponent } from "../src/game/enemy/enemy-brain-component";
import { PlayerInputComponent } from "../src/game/player/player-input-component";
import { registerPrefab } from "../src/game/prefabs";
import { newGameSeed } from "../src/game/runtime/new-game-seed";
import { toSceneDefinition } from "../src/game/runtime/scene-runtime";
import { SequenceFixture } from "./support/sequence-harness";

// The game render composition constructs decoration atlases, which eagerly
// `new Image()`. That browser global is absent headless; this shim resolves the
// load with a no-op so the real composition constructs. The render systems are
// added but never stepped here — only the update path spawns entities.
class HeadlessImage {
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	#src = "";
	set src(value: string) {
		this.#src = value;
		queueMicrotask(() => this.onload?.());
	}
	get src(): string {
		return this.#src;
	}
}
(globalThis as { Image?: unknown }).Image ??= HeadlessImage;

const REPO_ROOT = ".";
const DEMO = "demo";

const toImportPath = (path: string): string =>
	`../${path.replace(/\\/g, "/")}`;

// Reproduce registrations.ts' side-effect globs with Bun's Glob (Vite's
// import.meta.glob is unavailable under bun test). Registering every component
// and prefab the shipped bundle would is what makes this a real-path boot:
// deserialize skips unknown components silently and spawnPrefab returns null on
// an unknown prefab, so a missing registration would surface here as a missing
// player or enemy rather than a thrown error.
const registerGameContent = async (): Promise<void> => {
	for (const path of new Glob(
		"src/{engine,game}/**/*-component.ts",
	).scanSync(REPO_ROOT)) {
		await import(toImportPath(path));
	}
	for (const path of new Glob("src/game/**/*-def.ts").scanSync(
		REPO_ROOT,
	)) {
		await import(toImportPath(path));
	}
	await import("../src/game/sequence/sequence-manifest");
	for (const path of new Glob(
		"src/game/content/prefabs/*.json",
	).scanSync(REPO_ROOT)) {
		const name = path
			.split(/[/\\]/)
			.pop()!
			.replace(/\.json$/, "");
		registerPrefab(name, JSON.parse(readFileSync(path, "utf8")));
	}
};

const demoFile = (): SceneFile =>
	JSON.parse(
		readFileSync("src/game/content/levels/demo.scene.json", "utf8"),
	) as SceneFile;

const emptyDevice: DeviceSnapshot = {
	keyboard: { keys: {} },
	mouse: {
		buttons: {},
		position: Vector2.zero(),
		wheel: Vector2.zero(),
		inside: false,
	},
	gamepads: {},
};

// Headless audio: voice-bank warming calls `audio.load`; with no assets on
// disk the load simply never resolves, so no bank is built and no system needs
// one for the spawn assertions.
const silentAudio = {
	load: () => new Promise<never>(() => {}),
} as unknown as AudioManager;

const memorySettings = (): SettingsStore => {
	const values = new Map<string, string>();
	return {
		get: (key) => values.get(key) ?? null,
		set: (key, value) => void values.set(key, value),
	};
};

describe("game composition boot", () => {
	beforeAll(registerGameContent);

	test("real game path spawns the player and a scene prefab", async () => {
		const file = demoFile();
		const settings = memorySettings();
		const resolveAuthored = (): AuthoredScene => ({
			config: toSceneConfig(file.config),
			entities: file.entities,
			bounds: null,
		});

		const fixture = await SequenceFixture.create({
			initialScene: DEMO,
			seed: newGameSeed,
			resolveScene: (): SceneDefinition =>
				toSceneDefinition(resolveAuthored()),
			collisionMatrix,
			input: emptyDevice,
			actions: NULL_ACTIONS,
			audio: silentAudio,
			registerSystems: (world) => {
				const { update, render } = gameComposition({
					settings,
					gravityY: file.config.gravity.y,
				});
				for (const system of update) {
					world.ecs.addUpdateSystem(system);
				}
				for (const system of render) {
					world.ecs.addRenderSystem(system);
				}
			},
		});

		fixture.step(5);

		const players = fixture.ecs.query(PlayerInputComponent);
		expect(players.length).toBe(1);

		const enemies = fixture.ecs.query(EnemyBrainComponent);
		expect(enemies.length).toBeGreaterThan(0);

		fixture.dispose();
	});
});
