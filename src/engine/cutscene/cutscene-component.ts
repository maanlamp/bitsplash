import type {
	CutsceneContext,
	CutsceneDef,
	CutsceneWait,
} from "./cutscene";

export class CutsceneComponent {
	def: CutsceneDef;
	context: CutsceneContext | null = null;
	sceneIndex = 0;
	iterator: Generator<CutsceneWait, void, unknown> | null = null;
	wait: CutsceneWait | null = null;
	skipHeldTime = 0;

	constructor(def: CutsceneDef) {
		this.def = def;
	}
}
