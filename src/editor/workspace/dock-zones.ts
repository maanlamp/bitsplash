import type { DockZone } from "./layout";

export type Rect = Readonly<{
	left: number;
	top: number;
	width: number;
	height: number;
}>;

const EDGE_FRACTION = 0.3;

export const toRect = (dom: DOMRect): Rect => ({
	left: dom.left,
	top: dom.top,
	width: dom.width,
	height: dom.height,
});

export const contains = (rect: Rect, x: number, y: number): boolean =>
	x >= rect.left &&
	x <= rect.left + rect.width &&
	y >= rect.top &&
	y <= rect.top + rect.height;

export const dockZone = (
	rect: Rect,
	x: number,
	y: number,
): DockZone => {
	const fx = rect.width > 0 ? (x - rect.left) / rect.width : 0.5;
	const fy = rect.height > 0 ? (y - rect.top) / rect.height : 0.5;
	const left = fx;
	const right = 1 - fx;
	const top = fy;
	const bottom = 1 - fy;
	const min = Math.min(left, right, top, bottom);
	if (min > EDGE_FRACTION) {
		return "center";
	}
	if (min === left) {
		return "left";
	}
	if (min === right) {
		return "right";
	}
	if (min === top) {
		return "top";
	}
	return "bottom";
};

export const zoneRect = (rect: Rect, zone: DockZone): Rect => {
	const halfW = rect.width / 2;
	const halfH = rect.height / 2;
	switch (zone) {
		case "left":
			return {
				left: rect.left,
				top: rect.top,
				width: halfW,
				height: rect.height,
			};
		case "right":
			return {
				left: rect.left + halfW,
				top: rect.top,
				width: halfW,
				height: rect.height,
			};
		case "top":
			return {
				left: rect.left,
				top: rect.top,
				width: rect.width,
				height: halfH,
			};
		case "bottom":
			return {
				left: rect.left,
				top: rect.top + halfH,
				width: rect.width,
				height: halfH,
			};
		default:
			return rect;
	}
};
