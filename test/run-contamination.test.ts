import { Glob } from "bun";
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { NullAudioManager } from "../src/engine/audio/null-audio-manager";
import { Camera2DComponent } from "../src/engine/camera/camera-2d-component";
import { NULL_ACTIONS } from "../src/engine/input/bindings/action-provider";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import type { SettingsStore } from "../src/engine/input/settings-store";
import type { SceneDefinition } from "../src/engine/runtime/runtime";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { migrateRenderLayers } from "../src/engine/render/migrate-render-layers";
import {
	Scene,
	type SceneFile,
	toSceneConfig,
} from "../src/engine/scene/scene";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import { serializeWorld } from "../src/engine/serialization/serialize";
import type {
	SerializedEntity,
	SerializedWorld,
} from "../src/engine/serialization/registry";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { World } from "../src/engine/world";
import { moveEntity } from "../src/editor/commands";
import { SceneDocument } from "../src/editor/scene-document";
import { collisionMatrix } from "../src/game/collision";
import { DamageEvent } from "../src/game/events";
import { HealthComponent } from "../src/game/health/health-component";
import { HitsplatComponent } from "../src/game/hitsplat/hitsplat-component";
import { game as gameComposition } from "../src/game/compositions";
import { registerPrefab } from "../src/game/prefabs";
import { newGameSeed } from "../src/game/runtime/new-game-seed";
import { toSceneDefinition } from "../src/game/runtime/scene-runtime";
import { registerClimateContent } from "../src/game/weather/climate-catalog";
import { migrateLegacyTiles } from "../src/game/scenes/migrate-legacy-tiles";
import { SequenceFixture } from "./support/sequence-harness";

class HeadlessImage {
	onload: (() => void) | null = null;
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

const loadRapierHeadless = (): Promise<void> =>
	loadRapier(async () => {
		const mod =
			(await import("@dimforge/rapier2d-compat")) as unknown as {
				init: () => Promise<void>;
			};
		await mod.init();
		return mod as never;
	});

const registerGameContent = async (): Promise<void> => {
	await loadRapierHeadless();
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
	// Called rather than merely imported: the module registers on import, but a
	// second import is a no-op, so a test file that ran earlier and cleared the
	// registry would leave the demo scene's authored weather override dangling.
	registerClimateContent();
	for (const path of new Glob(
		"src/game/content/prefabs/*.prefab.json",
	).scanSync(REPO_ROOT)) {
		const name = path
			.split(/[/\\]/)
			.pop()!
			.replace(/\.prefab\.json$/, "");
		registerPrefab(name, JSON.parse(readFileSync(path, "utf8")));
	}
};

const migratedDemo = (): SceneFile =>
	migrateLegacyTiles(
		migrateRenderLayers(
			JSON.parse(
				readFileSync(
					"src/game/content/levels/demo.scene.json",
					"utf8",
				),
			) as SceneFile,
			DEMO,
		),
		DEMO,
		"dirt.png",
	);

const openDocument = (baseline: SceneFile): SceneDocument => {
	const config = toSceneConfig(baseline.config);
	const world = new World(config.gravity, collisionMatrix);
	deserializeWorld(world, baseline.entities, "edit world", "throw");
	const scene = new Scene({
		kind: baseline.kind,
		name: baseline.name ?? DEMO,
		config,
		world,
	});
	return new SceneDocument(scene, baseline);
};

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

const silentAudio = new NullAudioManager();

const memorySettings = (): SettingsStore => {
	const values = new Map<string, string>();
	return {
		get: (key) => values.get(key) ?? null,
		set: (key, value) => void values.set(key, value),
	};
};

const byId = (
	world: SerializedWorld,
): Map<string, SerializedEntity> =>
	new Map(world.map((e) => [e.id, e]));

const differingIds = (
	a: SerializedWorld,
	b: SerializedWorld,
): ReadonlyArray<string> => {
	const other = byId(b);
	return a
		.filter(
			(e) =>
				JSON.stringify(e) !== JSON.stringify(other.get(e.id) ?? null),
		)
		.map((e) => e.id);
};

/**
 * Boot a real run world on the game composition, resolving the document's
 * projection (plan D5): the player and scene prefabs spawn, a follow camera is
 * created, and physics runs — the same world the shipped game steps.
 */
const bootRun = (
	document: SceneDocument,
	gravityY: number,
): Promise<SequenceFixture> => {
	const settings = memorySettings();
	return SequenceFixture.create({
		initialScene: DEMO,
		seed: newGameSeed,
		resolveScene: (): SceneDefinition =>
			toSceneDefinition(document.toAuthoredScene()),
		collisionMatrix,
		input: emptyDevice,
		actions: NULL_ACTIONS,
		audio: silentAudio,
		registerSystems: (world) => {
			const { update, render } = gameComposition({
				settings,
				gravityY,
			});
			for (const system of update) {
				world.ecs.addUpdateSystem(system);
			}
			for (const system of render) {
				world.ecs.addRenderSystem(system);
			}
		},
	});
};

describe("run contamination", () => {
	beforeAll(registerGameContent);

	test("a run's simulation never leaks into a scene file save", async () => {
		const baseline = migratedDemo();
		const document = openDocument(baseline);

		// The pre-run committed artifact.
		const preRun = document.save();
		document.markSaved(preRun);

		const fixture = await bootRun(
			document,
			baseline.config.gravity.y,
		);

		fixture.step(20);
		// A goToScene transition: freeze the active scene, despawn, re-enter.
		fixture.runtime.goToScene(DEMO, "revisit");
		fixture.step(10);

		// The run world genuinely accumulated runtime-spawned entities not in the
		// document — otherwise the test would prove nothing.
		const runCameras = fixture.ecs.query(Camera2DComponent);
		expect(runCameras.length).toBeGreaterThan(0);
		expect(fixture.ecs.entities().length).toBeGreaterThan(
			baseline.entities.length,
		);
		const documentIds = new Set(baseline.entities.map((e) => e.id));
		expect(runCameras.every(([id]) => !documentIds.has(id))).toBe(
			true,
		);

		// Bind the run world as the command router's live target, then journal
		// exactly one edit to a document entity.
		document.bindRun({
			world: fixture.world,
			config: document.config,
		});
		const target = baseline.entities.find(
			(e) => "Transform" in e.components,
		)!;
		const transform = document.projection.getComponent(
			target.id as never,
			TransformComponent,
		)!;
		const before = {
			x: transform.position.x,
			y: transform.position.y,
		};
		const after = { x: before.x + 32, y: before.y - 16 };
		moveEntity(document, target.id as never, before, after);

		// Save DURING the run.
		const duringRun = document.save();
		expectOnlyTheOneEdit(
			duringRun.entities,
			preRun.entities,
			target.id,
		);

		// Stop: unbind + rebuild the edit world from the document (plan D8), then
		// save again.
		document.unbindRun();
		document.rebuildLive();
		fixture.dispose();

		const afterStop = document.save();
		expectOnlyTheOneEdit(
			afterStop.entities,
			preRun.entities,
			target.id,
		);
	});
});

/**
 * A transient effect entity must be whole-or-nothing in a runtime snapshot. A
 * hitsplat carries only an undecorated component, so it is invisible to
 * `serializeWorld` — but the moment it also carries a serializable
 * `TransformComponent`, capture writes half of it and restore thaws an entity
 * no system owns: a transform-only orphan that never ages and never dies, one
 * per hit taken, forever. Nothing surfaces that but a snapshot round-trip.
 */
describe("snapshot orphans", () => {
	beforeAll(registerGameContent);

	test("a live hitsplat leaves no transform-only orphan behind a snapshot", async () => {
		const baseline = migratedDemo();
		const document = openDocument(baseline);
		const fixture = await bootRun(
			document,
			baseline.config.gravity.y,
		);
		fixture.step(20);

		const settled = fixture.ecs.entities().length;

		const victim = fixture.ecs.query(HealthComponent)[0];
		if (!victim) {
			throw new Error("the run world has nothing that can be hit");
		}
		fixture.world.events.emit(
			new DamageEvent(victim[0], 7, false, "arrow", null),
		);
		fixture.step(1);

		const splats = fixture.ecs.query(HitsplatComponent);
		expect(splats.length).toBeGreaterThan(0);
		const splatIds = new Set(splats.map(([id]) => id));

		// The artifact itself: the snapshot carries no fragment of a hitsplat.
		const snapshot = serializeWorld(fixture.ecs);
		expect(
			snapshot.filter((e) => splatIds.has(e.id as never)),
		).toEqual([]);
		expect(
			snapshot.filter(
				(e) => Object.keys(e.components).join() === "Transform",
			),
		).toEqual([]);

		await fixture.saveAndReload();

		// And the restored world: gone, rather than immortal.
		fixture.step(120);
		expect(
			fixture.ecs.entities().filter((id) => splatIds.has(id)),
		).toEqual([]);
		expect(fixture.ecs.entities().length).toBeLessThanOrEqual(
			settled,
		);

		fixture.dispose();
	});
});

const expectOnlyTheOneEdit = (
	saved: SerializedWorld,
	preRun: SerializedWorld,
	editedId: string,
): void => {
	// Same entity set: no runtime-spawned camera, prefab enemy, fade, or
	// sequence run-state leaked in, and nothing authored was dropped.
	expect(new Set(saved.map((e) => e.id))).toEqual(
		new Set(preRun.map((e) => e.id)),
	);
	// No camera component of any kind reaches the file.
	expect(saved.some((e) => "Camera2D" in e.components)).toBe(false);
	// Exactly the one journaled edit differs from the pre-run artifact.
	expect(differingIds(saved, preRun)).toEqual([editedId]);
};
