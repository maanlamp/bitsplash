import { useEffect, useRef } from "react";
import { pickActiveCamera2D } from "../../engine/camera/camera-2d-render";
import { SHEET_COLUMNS } from "../../engine/tilemap/autotile";
import Vector2 from "../../engine/vector2";
import styles from "./sprite-editor.module.scss";
import { setCursorMode } from "../cursor";
import type { History } from "../history";
import { bresenham } from "../line";
import { cursorForTool, toolShowsBrush } from "./sprite-tools";
import { SpriteLayer } from "./layers";
import { createPreviewGame } from "./preview-game";
import { SpriteCameraSystem } from "./sprite-camera";
import { SpriteCheckerSystem } from "./sprite-checker";
import type {
	SpriteDocument,
	StrokeSnapshot,
} from "./sprite-document";
import type { SpriteEditorState } from "./sprite-editor-state";
import { SpriteGridSystem } from "./sprite-grid";
import { type HoverState, SpriteHoverSystem } from "./sprite-hover";
import { SpriteImageRenderSystem } from "./sprite-image-render";
import { commitStroke } from "./stroke";

const TexturePanel = ({
	doc,
	state,
	history,
	isTileset,
}: Readonly<{
	doc: SpriteDocument;
	state: SpriteEditorState;
	history: History;
	isTileset: boolean;
}>) => {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		const { game, scene } = createPreviewGame();
		const detach = game.viewport.attach(container);
		const element = game.viewport.element;
		const tileSize = isTileset ? doc.width / SHEET_COLUMNS : 0;
		const padding = isTileset
			? tileSize
			: Math.max(8, Math.round(doc.width / 8));
		const hover: HoverState = { x: 0, y: 0, active: false };

		const inBounds = (x: number, y: number): boolean =>
			x >= 0 && y >= 0 && x < doc.width && y < doc.height;

		scene.ecs.addUpdateSystem(
			new SpriteCameraSystem(
				state,
				{
					min: new Vector2(0, 0),
					max: new Vector2(doc.width, doc.height),
				},
				padding,
			),
		);
		scene.ecs.addRenderSystem(
			new SpriteCheckerSystem(SpriteLayer.BACKGROUND, {
				x: 0,
				y: 0,
				width: doc.width,
				height: doc.height,
			}),
		);
		scene.ecs.addRenderSystem(
			new SpriteImageRenderSystem(doc, SpriteLayer.CONTENT),
		);
		scene.ecs.addRenderSystem(
			new SpriteHoverSystem(SpriteLayer.CONTENT, hover, state),
		);
		scene.ecs.addRenderSystem(
			new SpriteGridSystem(SpriteLayer.CONTENT, tileSize, {
				x: 0,
				y: 0,
				width: doc.width,
				height: doc.height,
			}),
		);

		const stop = game.start();
		const unsub = doc.subscribe(() => {
			game.renderer.invalidateImage(doc.canvas);
		});

		let overImage = false;
		const updateCursor = () => {
			setCursorMode(element, cursorForTool(state.tool, overImage));
			if (!toolShowsBrush(state.tool)) {
				hover.active = false;
			}
		};
		updateCursor();
		const unsubTool = state.subscribe(updateCursor);

		let painting = false;
		let stroke: StrokeSnapshot | null = null;
		let lastX = 0;
		let lastY = 0;

		const pixelAt = (
			e: PointerEvent,
		): { x: number; y: number } | null => {
			const camera = pickActiveCamera2D(scene.ecs);
			if (!camera) {
				return null;
			}
			const rect = element.getBoundingClientRect();
			const world = camera.screenToWorld(
				new Vector2(e.clientX - rect.left, e.clientY - rect.top),
			);
			return { x: Math.floor(world.x), y: Math.floor(world.y) };
		};

		const apply = (x: number, y: number) => {
			if (state.tool === "erase") {
				doc.erasePixel(x, y);
			} else {
				doc.setPixel(x, y, state.css);
			}
		};

		const pick = (x: number, y: number) => {
			const rgba = doc.colorAt(x, y);
			if (rgba) {
				state.setFromRgba(rgba[0], rgba[1], rgba[2], rgba[3]);
			}
		};

		const onPointerDown = (e: PointerEvent) => {
			if (e.button !== 0 || state.tool === "pan") {
				return;
			}
			const p = pixelAt(e);
			if (!p || !inBounds(p.x, p.y)) {
				return;
			}
			if (state.tool === "pick") {
				pick(p.x, p.y);
				return;
			}
			painting = true;
			stroke = doc.snapshot();
			element.setPointerCapture(e.pointerId);
			apply(p.x, p.y);
			lastX = p.x;
			lastY = p.y;
		};

		const onPointerMove = (e: PointerEvent) => {
			const p = pixelAt(e);
			if (!p) {
				return;
			}
			hover.x = p.x;
			hover.y = p.y;
			overImage = inBounds(p.x, p.y);
			hover.active = toolShowsBrush(state.tool) && overImage;
			updateCursor();
			if (painting) {
				bresenham(lastX, lastY, p.x, p.y, apply);
				lastX = p.x;
				lastY = p.y;
			}
		};

		const onPointerUp = () => {
			if (!painting) {
				return;
			}
			painting = false;
			if (stroke) {
				commitStroke(doc, history, stroke);
				stroke = null;
			}
		};

		const onLeave = () => {
			hover.active = false;
			overImage = false;
			updateCursor();
		};

		element.addEventListener("pointerdown", onPointerDown);
		element.addEventListener("pointermove", onPointerMove);
		element.addEventListener("pointerup", onPointerUp);
		element.addEventListener("pointerleave", onLeave);

		return () => {
			element.removeEventListener("pointerdown", onPointerDown);
			element.removeEventListener("pointermove", onPointerMove);
			element.removeEventListener("pointerup", onPointerUp);
			element.removeEventListener("pointerleave", onLeave);
			unsubTool();
			unsub();
			stop();
			detach();
		};
	}, [doc, state, history, isTileset]);

	return (
		<div ref={containerRef} className={styles.spriteCanvasHost} />
	);
};

export default TexturePanel;
