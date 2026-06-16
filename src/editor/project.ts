import {
	createScene,
	type SceneSummary,
	sceneSummaries,
} from "../engine/scene/registry";
import type { Scene } from "../engine/scene/scene";
import type { GlobalServices } from "../engine/services";
import { EditorState } from "./editor-state";

export class Project {
	private readonly services: GlobalServices;
	private readonly scenes = new Map<string, Scene>();
	private readonly stores = new Map<string, EditorState>();

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
			scene = createScene(id, this.services);
			this.scenes.set(id, scene);
		}
		return scene;
	}

	store(id: string): EditorState {
		let store = this.stores.get(id);
		if (!store) {
			store = new EditorState();
			this.stores.set(id, store);
		}
		return store;
	}
}
