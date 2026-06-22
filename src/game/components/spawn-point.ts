import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

@serializable("SpawnPoint")
export class SpawnPointComponent {
	@serialize() prefab: string;
	@serialize() spawnOnLoad: boolean;

	constructor(prefab: string = "", spawnOnLoad: boolean = true) {
		this.prefab = prefab;
		this.spawnOnLoad = spawnOnLoad;
	}
}
