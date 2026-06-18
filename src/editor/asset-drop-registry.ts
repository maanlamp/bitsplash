import type { EntityId } from "../engine/ecs";
import type { AssetType } from "./assets";

export const DRAG_MIME = "application/x-bitsplash-asset";

export type AssetDragPayload = Readonly<{
	type: "asset-drag";
	path: string;
	assetType: AssetType;
}>;

export type DropTarget = "scene-view" | "inspector-field";

export type DropContext = Readonly<{
	target: DropTarget;
	field?: Readonly<{
		entityId?: EntityId;
		componentType: string;
		fieldKey: string;
		apply: (webPath: string) => void;
	}>;
}>;

export type DropHandler = (
	payload: AssetDragPayload,
	context: DropContext,
) => void;

const handlers = new Map<string, DropHandler>();

const key = (assetType: AssetType, target: DropTarget): string =>
	`${assetType}:${target}`;

export const AssetDropRegistry = {
	register(
		assetTypes: ReadonlyArray<AssetType>,
		targets: ReadonlyArray<DropTarget>,
		handler: DropHandler,
	): void {
		for (const assetType of assetTypes) {
			for (const target of targets) {
				handlers.set(key(assetType, target), handler);
			}
		}
	},
	resolve(
		payload: AssetDragPayload,
		context: DropContext,
	): DropHandler | null {
		return (
			handlers.get(key(payload.assetType, context.target)) ?? null
		);
	},
};

export const writeDragPayload = (
	dataTransfer: DataTransfer,
	payload: AssetDragPayload,
): void => {
	dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
	dataTransfer.effectAllowed = "copy";
};

export const readDragPayload = (
	dataTransfer: DataTransfer,
): AssetDragPayload | null => {
	const raw = dataTransfer.getData(DRAG_MIME);
	if (!raw) {
		return null;
	}
	try {
		const parsed = JSON.parse(raw) as AssetDragPayload;
		return parsed.type === "asset-drag" ? parsed : null;
	} catch {
		return null;
	}
};
