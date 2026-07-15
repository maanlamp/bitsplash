import { beforeAll, describe, expect, test } from "bun:test";
import { Project } from "../src/editor/project";
import {
	allViewIds,
	type Workspace,
	WORKSPACE_VERSION,
} from "../src/editor/workspace/layout";
import { loadWorkspace } from "../src/editor/workspace/persist";
import {
	isSceneView,
	isValidViewId,
	nextSceneViewId,
	parseViewId,
	sceneDocumentId,
} from "../src/editor/workspace/view-registry";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { migrateRenderLayers } from "../src/engine/render/migrate-render-layers";
import "../src/engine/render/render-layers-component";
import {
	registerSceneFile,
	sceneSummaries,
} from "../src/engine/scene/registry";
import {
	Scene,
	type SceneFile,
	toSceneConfig,
} from "../src/engine/scene/scene";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import type { GlobalServices } from "../src/engine/services";
import { World } from "../src/engine/world";

const rawFile = (): SceneFile => ({
	version: 1,
	kind: "platformer",
	name: "Demo",
	config: { gravity: { x: 0, y: 20 } },
	entities: [],
});

describe("scene view identity (view-instance id ≠ document id)", () => {
	test("both a primary and a suffixed view id resolve to one document id", () => {
		const primary = "scene:demo";
		const second = "scene:demo#2";

		expect(isSceneView(primary)).toBe(true);
		expect(isSceneView(second)).toBe(true);
		expect(parseViewId(second).param).toBe("demo");
		expect(sceneDocumentId(second)).toBe("demo");
		expect(sceneDocumentId(second)).toBe(sceneDocumentId(primary));
	});

	test("non-scene ids have no document id", () => {
		expect(sceneDocumentId("inspector")).toBeNull();
		expect(sceneDocumentId("sprite:/foo/bar.png")).toBeNull();
	});

	test("nextSceneViewId mints a unique instance per scene", () => {
		expect(nextSceneViewId("demo", [])).toBe("scene:demo");
		expect(nextSceneViewId("demo", ["scene:demo"])).toBe(
			"scene:demo#2",
		);
		expect(
			nextSceneViewId("demo", ["scene:demo", "scene:demo#2"]),
		).toBe("scene:demo#3");
		// A different scene is unaffected by demo's instances.
		expect(
			nextSceneViewId("cave", ["scene:demo", "scene:demo#2"]),
		).toBe("scene:cave");
	});

	test("a suffixed scene view id validates against the scene registry", () => {
		registerSceneFile("demo", rawFile());
		expect(sceneSummaries().some((s) => s.id === "demo")).toBe(true);
		expect(isValidViewId("scene:demo", [])).toBe(true);
		expect(isValidViewId("scene:demo#2", [])).toBe(true);
		expect(isValidViewId("scene:missing#2", [])).toBe(false);
	});
});

describe("workspace persistence migration", () => {
	const storage = new Map<string, string>();

	beforeAll(() => {
		(globalThis as { localStorage?: Storage }).localStorage = {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => {
				storage.set(key, value);
			},
			removeItem: (key: string) => {
				storage.delete(key);
			},
			clear: () => storage.clear(),
			key: () => null,
			length: 0,
		} as Storage;
	});

	const persist = (workspace: Workspace): void => {
		storage.set("editor-workspace", JSON.stringify(workspace));
	};

	const tabsWorkspace = (
		views: ReadonlyArray<string>,
		focused: string,
	): Workspace => ({
		version: WORKSPACE_VERSION,
		root: { type: "tabs", views, active: focused },
		focused,
	});

	test("a legacy layout with only a primary scene id loads unchanged", () => {
		persist(tabsWorkspace(["scene:demo"], "scene:demo"));

		const loaded = loadWorkspace(isSceneView, "scene:demo");

		expect(allViewIds(loaded.root)).toEqual(["scene:demo"]);
		expect(loaded.focused).toBe("scene:demo");
	});

	test("multiple views of one scene both survive a load", () => {
		persist(
			tabsWorkspace(["scene:demo", "scene:demo#2"], "scene:demo#2"),
		);

		const loaded = loadWorkspace(isSceneView, "scene:demo");

		expect([...allViewIds(loaded.root)]).toEqual([
			"scene:demo",
			"scene:demo#2",
		]);
		expect(loaded.focused).toBe("scene:demo#2");
	});

	test("only genuinely-invalid views are dropped, suffixed views kept", () => {
		persist(
			tabsWorkspace(["scene:demo#2", "bogus:thing"], "scene:demo#2"),
		);

		const loaded = loadWorkspace(isSceneView, "scene:demo");

		expect([...allViewIds(loaded.root)]).toEqual(["scene:demo#2"]);
	});
});

describe("shared per-scene document ownership", () => {
	const loadRapierHeadless = (): Promise<void> =>
		loadRapier(async () => {
			const mod =
				(await import("@dimforge/rapier2d-compat")) as unknown as {
					init: () => Promise<void>;
				};
			await mod.init();
			return mod as never;
		});

	beforeAll(async () => {
		await loadRapierHeadless();
	});

	const preloadedScene = (): Scene => {
		const baseline = migrateRenderLayers(rawFile(), "demo");
		const config = toSceneConfig(baseline.config);
		const world = new World(config.gravity);
		deserializeWorld(world, baseline.entities, "test", "throw");
		return new Scene({
			kind: baseline.kind,
			name: baseline.name ?? "demo",
			config,
			world,
		});
	};

	test("every view of a scene binds the exact same document instance", () => {
		registerSceneFile("demo", rawFile());
		const scene = preloadedScene();
		const project = new Project({} as unknown as GlobalServices, {
			demo: scene,
		});

		const first = project.document("demo");
		const second = project.document("demo");

		// Two views (scene:demo, scene:demo#2) both call project.document("demo")
		// and receive one shared document — divergence is unrepresentable (D13).
		expect(second).toBe(first);
		expect(first.scene).toBe(scene);
		expect(project.hasDocument("demo")).toBe(true);
		expect(project.hasDocument("cave")).toBe(false);
	});
});
