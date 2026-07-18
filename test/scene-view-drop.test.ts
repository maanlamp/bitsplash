import { Glob } from "bun";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { migrateRenderLayers } from "../src/engine/render/migrate-render-layers";
import {
	Scene,
	type SceneFile,
	toSceneConfig,
} from "../src/engine/scene/scene";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import { serializeEntity } from "../src/engine/serialization/serialize";
import { SpriteComponent } from "../src/engine/sprite/sprite-component";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { World } from "../src/engine/world";

const toastCalls: string[] = [];
void mock.module("../src/editor/toast", () => ({
	toastManager: {},
	toastError: (title: string) => {
		toastCalls.push(title);
	},
}));

const loadRapierHeadless = (): Promise<void> =>
	loadRapier(async () => {
		const mod =
			(await import("@dimforge/rapier2d-compat")) as unknown as {
				init: () => Promise<void>;
			};
		await mod.init();
		return mod as never;
	});

const registerComponents = async (): Promise<void> => {
	for (const path of new Glob(
		"src/{engine,game}/**/*-component.ts",
	).scanSync(".")) {
		await import(`../${path.replace(/\\/g, "/")}`);
	}
};

const emptyScene = (
	defaultEntity?: (position: Vector2) => ReadonlyArray<object>,
): Scene => {
	const baseline: SceneFile = migrateRenderLayers(
		{
			version: 1,
			kind: "platformer",
			config: { gravity: { x: 0, y: 20 } },
			entities: [],
		},
		"demo",
	);
	const config = toSceneConfig(baseline.config);
	const world = new World(config.gravity);
	deserializeWorld(world, baseline.entities, "edit world", "throw");
	return new Scene({
		kind: baseline.kind,
		name: "demo",
		config,
		world,
		defaultEntity: defaultEntity ?? undefined,
	});
};

type Deferred = typeof import("../src/editor/asset-drop-registry");
type EditorStateMod = typeof import("../src/editor/editor-state");

let registry: Deferred;
let SceneDocument: typeof import("../src/editor/scene-document").SceneDocument;
let EditorState: EditorStateMod["EditorState"];

const flush = () => new Promise((r) => setTimeout(r, 0));

type Desktop = {
	getAssetsRoot: () => Promise<{ path: string }>;
	readTextFile: (params: {
		path: string;
	}) => Promise<{ text: string }>;
};

const desktop: Desktop = {
	getAssetsRoot: async () => ({ path: "/root" }),
	readTextFile: async () => {
		throw new Error("readTextFile not stubbed for this test");
	},
};

beforeAll(async () => {
	await loadRapierHeadless();
	await registerComponents();
	// Stub the desktop bridge so resolveToWebPath / readTextFile resolve without
	// Electron. Individual tests override `readTextFile` to script the file read.
	(globalThis as { bitsplashDesktop?: unknown }).bitsplashDesktop =
		desktop;
	registry = await import("../src/editor/asset-drop-registry");
	SceneDocument = (await import("../src/editor/scene-document"))
		.SceneDocument;
	EditorState = (await import("../src/editor/editor-state"))
		.EditorState;
	// Import for side-effect: registers the scene-view handlers.
	await import("../src/editor/register-drops");
});

describe("scene-view drop placement (plan F1-F3)", () => {
	test("a sprite drop creates a snapped entity with exactly Transform + Sprite (urlRef set), never the scene default entity", async () => {
		// A defaultEntity that throws proves the sprite drop no longer routes
		// through it (which stamps extras such as a DebugTag "entity" label).
		const scene = emptyScene(() => {
			throw new Error("sprite drop must not use scene.defaultEntity");
		});
		const doc = new SceneDocument(scene, {
			version: 1,
			kind: "platformer",
			config: { gravity: { x: 0, y: 20 } },
			entities: [],
		} as SceneFile);
		const store = new EditorState();
		const before = new Set(doc.projection.entities());

		const handler = registry.AssetDropRegistry.resolve(
			{
				type: "asset-drag",
				path: "/root/foo.png",
				assetType: "sprite",
			},
			{ target: "scene-view" },
		);
		expect(handler).not.toBeNull();
		handler!(
			{
				type: "asset-drag",
				path: "/root/foo.png",
				assetType: "sprite",
			},
			{
				target: "scene-view",
				sceneView: {
					document: doc,
					store,
					worldPoint: { x: 64, y: 32 },
				},
			},
		);
		await flush();

		const added = doc.projection
			.entities()
			.filter((id) => !before.has(id));
		expect(added.length).toBe(1);
		const id = added[0]!;
		const serialized = serializeEntity(doc.projection, id)!;
		expect(Object.keys(serialized.components).sort()).toEqual([
			"Sprite",
			"Transform",
		]);
		const transform = doc.projection.getComponent(
			id,
			TransformComponent,
		)!;
		expect({
			x: transform.position.x,
			y: transform.position.y,
		}).toEqual({ x: 64, y: 32 });
		const sprite = doc.projection.getComponent(id, SpriteComponent)!;
		expect(sprite.urlRef.path).toBe(
			"/src/game/content/assets/foo.png",
		);
		expect(store.primaryId).toBe(id);
	});

	test("a prefab drop journals a raw entity-create with position patched to the drop point", async () => {
		const scene = emptyScene();
		const doc = new SceneDocument(scene, {
			version: 1,
			kind: "platformer",
			config: { gravity: { x: 0, y: 20 } },
			entities: [],
		} as SceneFile);
		const store = new EditorState();
		const before = new Set(doc.projection.entities());

		const prefab = {
			components: {
				Transform: {
					position: { $type: "Vector2", x: 0, y: 0 },
					rotation: { $type: "Angle", radians: 0 },
					scale: { $type: "Vector2", x: 1, y: 1 },
				},
				Health: { hp: 30, maxHp: 30 },
			},
		};
		// The prefab JSON is read through the desktop bridge (main-process fs),
		// not a cross-origin fetch. Capture the path it resolves on disk.
		const prefabPath = "/root/prefabs/enemy.prefab.json";
		const seen: { path: string | null } = { path: null };
		desktop.readTextFile = async ({ path }) => {
			seen.path = path;
			return { text: JSON.stringify(prefab) };
		};

		try {
			const payload = {
				type: "asset-drag" as const,
				path: prefabPath,
				assetType: "prefab" as const,
			};
			const handler = registry.AssetDropRegistry.resolve(payload, {
				target: "scene-view",
			});
			expect(handler).not.toBeNull();
			handler!(payload, {
				target: "scene-view",
				sceneView: {
					document: doc,
					store,
					worldPoint: { x: 128, y: 96 },
				},
			});
			await flush();
		} finally {
			desktop.readTextFile = async () => {
				throw new Error("readTextFile not stubbed for this test");
			};
		}

		expect(seen.path).toBe(prefabPath);
		const added = doc.projection
			.entities()
			.filter((id) => !before.has(id));
		expect(added.length).toBe(1);
		const transform = doc.projection.getComponent(
			added[0]!,
			TransformComponent,
		)!;
		expect({
			x: transform.position.x,
			y: transform.position.y,
		}).toEqual({ x: 128, y: 96 });
		// It was journaled (undoable), never spawned into a live world path.
		expect(doc.canUndo).toBe(true);
	});

	test("a prefab whose file can't be read fires a toast (no silent no-op)", async () => {
		toastCalls.length = 0;
		const scene = emptyScene();
		const doc = new SceneDocument(scene, {
			version: 1,
			kind: "platformer",
			config: { gravity: { x: 0, y: 20 } },
			entities: [],
		} as SceneFile);
		const store = new EditorState();
		const before = doc.projection.entities().length;

		desktop.readTextFile = async () => {
			throw new Error("fs read failed");
		};

		const payload = {
			type: "asset-drag" as const,
			path: "/root/prefabs/broken.prefab.json",
			assetType: "prefab" as const,
		};
		registry.AssetDropRegistry.resolve(payload, {
			target: "scene-view",
		})!(payload, {
			target: "scene-view",
			sceneView: {
				document: doc,
				store,
				worldPoint: { x: 0, y: 0 },
			},
		});
		await flush();

		expect(doc.projection.entities().length).toBe(before);
		expect(toastCalls.length).toBe(1);
	});
});
