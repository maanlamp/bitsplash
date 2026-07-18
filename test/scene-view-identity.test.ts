import { beforeAll, describe, expect, test } from "bun:test";
import { Project } from "../src/editor/project";
import {
	allViewIds,
	type Workspace,
	WORKSPACE_VERSION,
} from "../src/editor/workspace/layout";
import { loadWorkspace } from "../src/editor/workspace/persist";
import {
	isLegacyMultiViewId,
	isSceneView,
	isValidViewId,
	parseViewId,
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

describe("scene view identity (one view per scene)", () => {
	test("a scene view id's param is the scene id verbatim (no suffix strip)", () => {
		expect(parseViewId("scene:demo").param).toBe("demo");
		// The removed multi-view feature suffixed ids as `scene:<id>#n`; the
		// suffix is no longer stripped, so a legacy id resolves to a param that
		// matches no scene and is therefore treated as invalid.
		expect(parseViewId("scene:demo#2").param).toBe("demo#2");
	});

	test("legacy multi-view ids are recognised, plain scene ids are not", () => {
		expect(isLegacyMultiViewId("scene:demo#2")).toBe(true);
		expect(isLegacyMultiViewId("scene:demo")).toBe(false);
		expect(isLegacyMultiViewId("inspector")).toBe(false);
		expect(isLegacyMultiViewId("sprite:/a#b.png")).toBe(false);
	});

	test("a legacy suffixed scene view id fails validation", () => {
		registerSceneFile("demo", rawFile());
		expect(sceneSummaries().some((s) => s.id === "demo")).toBe(true);
		expect(isValidViewId("scene:demo", [])).toBe(true);
		expect(isValidViewId("scene:demo#2", [])).toBe(false);
		expect(isValidViewId("scene:missing", [])).toBe(false);
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

	// Mirrors the predicate the editor shell passes to loadWorkspace: keep a
	// scene view only when it is not a legacy multi-view id, else fall back to
	// asset/panel validation.
	const isValid = (id: string): boolean =>
		(isSceneView(id) && !isLegacyMultiViewId(id)) ||
		isValidViewId(id, []);

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

		const loaded = loadWorkspace(isValid, "scene:demo");

		expect(allViewIds(loaded.root)).toEqual(["scene:demo"]);
		expect(loaded.focused).toBe("scene:demo");
	});

	test("a persisted suffixed multi-view id is dropped on load", () => {
		persist(
			tabsWorkspace(["scene:demo", "scene:demo#2"], "scene:demo#2"),
		);

		const loaded = loadWorkspace(isValid, "scene:demo");

		expect([...allViewIds(loaded.root)]).toEqual(["scene:demo"]);
		// The dropped id can no longer be the focused view; focus clears to
		// null and the shell resolves a real scene view once the game loads.
		expect(loaded.focused).not.toBe("scene:demo#2");
	});

	test("a workspace of only suffixed views falls back to the default", () => {
		persist(
			tabsWorkspace(["scene:demo#2", "scene:demo#3"], "scene:demo#2"),
		);

		const loaded = loadWorkspace(isValid, "scene:demo");

		// Every persisted view was legacy; the default workspace is restored,
		// which contains a single primary scene view.
		expect(allViewIds(loaded.root)).toContain("scene:demo");
		expect(allViewIds(loaded.root).some(isLegacyMultiViewId)).toBe(
			false,
		);
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

	test("the single view of a scene binds one shared document instance", () => {
		registerSceneFile("demo", rawFile());
		const scene = preloadedScene();
		const project = new Project({} as unknown as GlobalServices, {
			demo: scene,
		});

		const first = project.document("demo");
		const second = project.document("demo");

		// Reopening the same scene view resolves the one shared document —
		// divergence is unrepresentable (D13).
		expect(second).toBe(first);
		expect(first.scene).toBe(scene);
		expect(project.hasDocument("demo")).toBe(true);
		expect(project.hasDocument("cave")).toBe(false);
	});
});
