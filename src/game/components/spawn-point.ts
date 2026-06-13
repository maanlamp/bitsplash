import { serializable } from "../../engine/serialization/serializable";

@serializable("SpawnPoint")
export class SpawnPointComponent {
	prefab: string;
	spawnOnLoad: boolean;

	constructor(prefab: string = "", spawnOnLoad: boolean = true) {
		this.prefab = prefab;
		this.spawnOnLoad = spawnOnLoad;
	}
}
