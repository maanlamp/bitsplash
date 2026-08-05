import type { EntityId } from "../engine/ecs";
import type { SceneConfig } from "../engine/scene/scene";
import type { World } from "../engine/world";
import type { SceneDocument } from "./scene-document";

/**
 * What the plugin needs from the run it serves, as plain callbacks so it holds
 * no {@link import("../engine/runtime/runtime").Runtime} reference of its own.
 */
export type RunDocumentDeps = Readonly<{
	/**
	 * The document authoring a scene id, created lazily if absent (a scene
	 * entered mid-run with no open document gets one — file → migrations →
	 * baseline + empty journal).
	 */
	ensureDocument: (sceneId: string) => SceneDocument;
	/** The live run world documents bind against. */
	world: () => World;
	/** The runtime's config for the active scene, or `null` to use the document's. */
	config: () => SceneConfig | null;
}>;

/**
 * The editor half of a run: command-router rebinding as the run moves between
 * scenes, and rebuilding the edit worlds it touched once it ends.
 *
 * A `HostPlugin` rather than host code because document-backed scene resolution
 * and router rebinding are inherently editor concerns — the shipped game has no
 * documents to bind. {@link enterScene} is idempotent so it can be driven both
 * by the host's `onSceneChanged` and directly by the run host the moment a
 * transition is observed, without rebinding twice.
 */
export class RunDocumentPlugin {
	private readonly visited = new Set<SceneDocument>();
	private bound: SceneDocument | null = null;
	private boundId: string | null = null;

	constructor(private readonly deps: RunDocumentDeps) {}

	onSceneChanged(id: string): void {
		this.enterScene(id);
	}

	/**
	 * Unbind the previously bound document and bind the one authoring `id`, so
	 * edits route to the run world. A no-op when `id` is already bound.
	 */
	enterScene(id: string): void {
		if (this.boundId === id) {
			return;
		}
		this.boundId = id;
		this.bound?.unbindRun();
		const doc = this.deps.ensureDocument(id);
		doc.bindRun({
			world: this.deps.world(),
			config: this.deps.config() ?? doc.config,
		});
		this.bound = doc;
		this.visited.add(doc);
	}

	/** Whether `id` is a runtime-spawned entity in the bound document. */
	isRuntimeEntity(id: EntityId): boolean {
		return this.bound?.isRuntimeEntity(id) ?? false;
	}

	/**
	 * End the run's hold on every document it visited: unbind the router and
	 * rebuild each edit world in place from its document, discarding whatever the
	 * run poked into it.
	 */
	onStop(): void {
		for (const doc of this.visited) {
			doc.unbindRun();
			doc.rebuildLive();
		}
		this.visited.clear();
		this.bound = null;
		this.boundId = null;
	}
}
