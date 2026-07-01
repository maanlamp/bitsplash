import { useEffect, useRef } from "react";
import { pickActiveCamera2D } from "../../engine/camera/camera-2d-render";
import { SHEET_COLUMNS } from "../../engine/tilemap/autotile";
import { TilemapRenderSystem } from "../../engine/tilemap/tilemap-render-system";
import { HALF_TILE_SIZE, TILE_SIZE } from "../../engine/tilemap/tile";
import { TileGrid } from "../../engine/tilemap/grid";
import Vector2 from "../../engine/vector2";
import styles from "./sprite-editor.module.scss";
import { setCursorMode } from "../cursor";
import type { History } from "../history";
import { bresenham } from "../line";
import { cursorForTool, toolShowsBrush } from "./sprite-tools";
import { SpriteLayer } from "./layers";
import { createPreviewGame } from "./preview-game";
import { populateSampleGrid, sampleBounds } from "./sample-layout";
import { SpriteCameraSystem } from "./sprite-camera";
import { SpriteCheckerSystem } from "./sprite-checker";
import type {
	SpriteDocument,
	StrokeSnapshot,
} from "./sprite-document";
import type { SpriteEditorState } from "./sprite-editor-state";
import { SpriteGridSystem } from "./sprite-grid";
import { type HoverState, SpriteHoverSystem } from "./sprite-hover";
import { commitStroke } from "./stroke";
import { resolveSourcePixel } from "./tile-paint";

const GameViewPanel = ({
	doc,
	state,
	history,
}: Readonly<{
	doc: SpriteDocument;
	state: SpriteEditorState;
	history: History;
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
		const srcSize = doc.width / SHEET_COLUMNS;
		const hover: HoverState = { x: 0, y: 0, active: false };

		const grid = new TileGrid();
		populateSampleGrid(grid);
		const bounds = sampleBounds();

		scene.ecs.addUpdateSystem(
			new SpriteCameraSystem(state, bounds, TILE_SIZE),
		);
		scene.ecs.addRenderSystem(
			new SpriteCheckerSystem(SpriteLayer.BACKGROUND, {
				x: bounds.min.x,
				y: bounds.min.y,
				width: bounds.max.x - bounds.min.x,
				height: bounds.max.y - bounds.min.y,
			}),
		);
		scene.ecs.addRenderSystem(
			new TilemapRenderSystem(grid, doc.canvas, SpriteLayer.CONTENT),
		);
		scene.ecs.addRenderSystem(
			new SpriteHoverSystem(SpriteLayer.CONTENT, hover, state),
		);
		scene.ecs.addRenderSystem(
			new SpriteGridSystem(SpriteLayer.CONTENT, srcSize, {
				x: bounds.min.x,
				y: bounds.min.y,
				width: bounds.max.x - bounds.min.x,
				height: bounds.max.y - bounds.min.y,
			}),
		);

		const stop = game.start();
		const unsub = doc.subscribe(() => {
			game.renderer.invalidateTileArray(doc.canvas);
		});

		const worldInBounds = (world: Vector2): boolean =>
			world.x >= bounds.min.x &&
			world.x < bounds.max.x &&
			world.y >= bounds.min.y &&
			world.y < bounds.max.y;

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
		let lastTx = 0;
		let lastTy = 0;

		const worldOf = (e: PointerEvent): Vector2 | null => {
			const camera = pickActiveCamera2D(scene.ecs);
			if (!camera) {
				return null;
			}
			const rect = element.getBoundingClientRect();
			return camera.screenToWorld(
				new Vector2(e.clientX - rect.left, e.clientY - rect.top),
			);
		};

		const resolveAt = (wx: number, wy: number) => {
			const cx = Math.floor((wx + HALF_TILE_SIZE) / TILE_SIZE);
			const cy = Math.floor((wy + HALF_TILE_SIZE) / TILE_SIZE);
			const x0 = cx * TILE_SIZE - HALF_TILE_SIZE;
			const y0 = cy * TILE_SIZE - HALF_TILE_SIZE;
			const rows = Math.max(1, Math.round(doc.height / srcSize));
			return resolveSourcePixel(
				grid,
				rows,
				srcSize,
				cx,
				cy,
				(wx - x0) / TILE_SIZE,
				(wy - y0) / TILE_SIZE,
				(x, y) => doc.alphaAt(x, y),
			);
		};

		const paintTexel = (tx: number, ty: number) => {
			const pixel = resolveAt(tx + 0.5, ty + 0.5);
			if (!pixel) {
				return;
			}
			if (state.tool === "erase") {
				doc.erasePixel(pixel.x, pixel.y);
			} else {
				doc.setPixel(pixel.x, pixel.y, state.css);
			}
		};

		const onPointerDown = (e: PointerEvent) => {
			if (e.button !== 0 || state.tool === "pan") {
				return;
			}
			const world = worldOf(e);
			if (!world) {
				return;
			}
			if (state.tool === "pick") {
				const pixel = resolveAt(world.x, world.y);
				const rgba = pixel && doc.colorAt(pixel.x, pixel.y);
				if (rgba) {
					state.setFromRgba(rgba[0], rgba[1], rgba[2], rgba[3]);
				}
				return;
			}
			painting = true;
			stroke = doc.snapshot();
			element.setPointerCapture(e.pointerId);
			lastTx = Math.floor(world.x);
			lastTy = Math.floor(world.y);
			paintTexel(lastTx, lastTy);
		};
		const onPointerMove = (e: PointerEvent) => {
			const world = worldOf(e);
			if (!world) {
				return;
			}
			const tx = Math.floor(world.x);
			const ty = Math.floor(world.y);
			hover.x = tx;
			hover.y = ty;
			overImage = worldInBounds(world);
			hover.active = toolShowsBrush(state.tool) && overImage;
			updateCursor();
			if (painting) {
				bresenham(lastTx, lastTy, tx, ty, paintTexel);
				lastTx = tx;
				lastTy = ty;
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
	}, [doc, state, history]);

	return (
		<div ref={containerRef} className={styles.spriteCanvasHost} />
	);
};

export default GameViewPanel;
