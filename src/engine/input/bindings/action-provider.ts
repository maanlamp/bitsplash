import type { DeviceSnapshot } from "../device-snapshot";
import type { ActionsApi } from "./actions-api";
import type { Expansion } from "./ref-expansion";

const EMPTY_EXPANSION: Expansion = {
	bindings: [],
	byAction: new Map(),
	danglingRefs: [],
	droppedEdges: [],
	invalidChordTokens: [],
};

export interface ActionProvider extends ActionsApi {
	step(snapshot: DeviceSnapshot, dtMs: number): void;
	resetEdges(): void;
}

export class NullActions implements ActionProvider {
	step(): void {}

	resetEdges(): void {}

	fired(): boolean {
		return false;
	}

	firedCount(): number {
		return 0;
	}

	active(): boolean {
		return false;
	}

	consume(): void {}

	getExpansion(): Expansion {
		return EMPTY_EXPANSION;
	}
}

export const NULL_ACTIONS: ActionProvider = new NullActions();
