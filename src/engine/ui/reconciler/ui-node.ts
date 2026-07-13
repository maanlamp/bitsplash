export interface UiNode {
	type: string;
	props: Record<string, unknown>;
	children: UiNode[];
	id: number;
	yoga?: unknown;
	layoutRect?: { x: number; y: number; w: number; h: number };
}
