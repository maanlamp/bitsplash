import type { Expansion } from "./ref-expansion";

export interface ActionsApi {
	fired(id: string): boolean;
	firedCount(id: string): number;
	active(id: string): boolean;
	consume(id: string): void;
	getExpansion(): Expansion;
}
