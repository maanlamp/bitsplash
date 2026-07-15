import {
	createScene,
	migratedSceneFile,
	type SceneSummary,
	sceneSummaries,
} from "../engine/scene/registry";
import type { Scene, SceneFile } from "../engine/scene/scene";
import type { GlobalServices } from "../engine/services";
import { EditorState } from "./editor-state";
import { SceneDocument } from "./scene-document";

export class Project {
	private readonly services: GlobalServices;
	private readonly scenes = new Map<string, Scene>();
	private readonly baselines = new Map<string, SceneFile>();
	private readonly stores = new Map<string, EditorState>();
	private readonly documents = new Map<string, SceneDocument>();

	constructor(
		services: GlobalServices,
		preloaded: Readonly<Record<string, Scene>> = {},
	) {
		this.services = services;
		for (const [id, scene] of Object.entries(preloaded)) {
			this.scenes.set(id, scene);
		}
	}

	get summaries(): ReadonlyArray<SceneSummary> {
		return sceneSummaries();
	}

	loaded(id: string): Scene | null {
		return this.scenes.get(id) ?? null;
	}

	scene(id: string): Scene {
		let scene = this.scenes.get(id);
		if (!scene) {
			const created = createScene(id, this.services, "throw");
			scene = created.scene;
			this.scenes.set(id, scene);
			this.baselines.set(id, created.file);
		}
		return scene;
	}

	/**
	 * The migrated scene file a {@link SceneDocument} baselines against. Cached
	 * from {@link createScene} for scenes this project built; recomputed from
	 * the registered raw file for a preloaded scene (e.g. the start scene the
	 * game shell constructed).
	 */
	baseline(id: string): SceneFile {
		let file = this.baselines.get(id);
		if (!file) {
			file = migratedSceneFile(this.scene(id), id);
			this.baselines.set(id, file);
		}
		return file;
	}

	store(id: string): EditorState {
		let store = this.stores.get(id);
		if (!store) {
			store = new EditorState();
			this.stores.set(id, store);
		}
		return store;
	}

	/**
	 * The {@link SceneDocument} for a scene id, created once and shared across
	 * every view of that scene (plan D13: worlds are owned by documents, views own
	 * no world). All views of one scene bind this document, so their edits, journal,
	 * and dirty state are one and the same.
	 */
	document(id: string): SceneDocument {
		let doc = this.documents.get(id);
		if (!doc) {
			doc = new SceneDocument(this.scene(id), this.baseline(id));
			this.documents.set(id, doc);
		}
		return doc;
	}

	/** Whether a document has been created for a scene id this session. */
	hasDocument(id: string): boolean {
		return this.documents.has(id);
	}
}
