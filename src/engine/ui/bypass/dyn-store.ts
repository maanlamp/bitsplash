import type { ColorInput } from "../../render/color-resolver";
import type { FontSettings } from "../../text/font-settings";
import type { Style } from "../style/style";
import type { UiNode } from "../reconciler/ui-node";

export interface DynValues {
	worldX?: number;
	worldY?: number;
	targetX?: number;
	targetY?: number;
	offsetX?: number;
	offsetY?: number;
	width?: number;
	height?: number;
	rotation?: number;
	alpha?: number;
	color?: ColorInput;
	backgroundColor?: ColorInput;
	visible?: boolean;
	reveal?: number;
	progress?: number;
	text?: string;
	scale?: number;
	font?: FontSettings;
}

export class DynStore {
	private values = new Map<number, DynValues>();

	get(id: number): DynValues | undefined {
		return this.values.get(id);
	}

	set(id: number, patch: Readonly<DynValues>): void {
		const current = this.values.get(id);
		if (current) {
			Object.assign(current, patch);
			return;
		}
		this.values.set(id, { ...patch });
	}

	setField<K extends keyof DynValues>(
		id: number,
		key: K,
		value: DynValues[K],
	): void {
		const current = this.values.get(id);
		if (current) {
			current[key] = value;
			return;
		}
		const entry: DynValues = {};
		entry[key] = value;
		this.values.set(id, entry);
	}

	clear(id: number): void {
		this.values.delete(id);
	}

	clearAll(): void {
		this.values.clear();
	}

	isVisible(node: UiNode): boolean {
		return this.values.get(node.id)?.visible ?? true;
	}

	rotation(node: UiNode): number {
		return this.values.get(node.id)?.rotation ?? 0;
	}

	offsetX(node: UiNode): number {
		return this.values.get(node.id)?.offsetX ?? 0;
	}

	offsetY(node: UiNode): number {
		return this.values.get(node.id)?.offsetY ?? 0;
	}

	reveal(node: UiNode): number {
		return (
			this.values.get(node.id)?.reveal ?? Number.POSITIVE_INFINITY
		);
	}

	progress(node: UiNode): number {
		return this.values.get(node.id)?.progress ?? 0;
	}

	alpha(node: UiNode, style: Style | undefined): number {
		return this.values.get(node.id)?.alpha ?? style?.alpha ?? 1;
	}

	width(node: UiNode, laidOut: number): number {
		return this.values.get(node.id)?.width ?? laidOut;
	}

	height(node: UiNode, laidOut: number): number {
		return this.values.get(node.id)?.height ?? laidOut;
	}

	color(
		node: UiNode,
		style: Style | undefined,
	): ColorInput | undefined {
		return this.values.get(node.id)?.color ?? style?.color;
	}

	backgroundColor(
		node: UiNode,
		style: Style | undefined,
	): ColorInput | undefined {
		return (
			this.values.get(node.id)?.backgroundColor ??
			style?.backgroundColor
		);
	}
}
