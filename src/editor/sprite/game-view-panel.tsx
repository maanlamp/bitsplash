import { useEffect, useRef, useSyncExternalStore } from "react";
import { pickActiveCamera2D } from "../../engine/camera/camera-2d-render";
import { SHEET_COLUMNS } from "../../engine/tilemap/autotile";
import { TilesetPreviewSystem } from "./tileset-preview-system";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import { TileGrid } from "../../engine/tilemap/grid";
import Vector2 from "../../engine/vector2";
import styles from "./sprite-editor.module.scss";
import { CursorAuthority } from "../../engine/cursor/cursor-authority";
import { clientToCanvas } from "../client-to-canvas";
import type { History } from "../history";
import { GestureController } from "./gesture-controller";
import type { SelectionController } from "./selection-controller";
import { getTool } from "./tool-registry";
import { type CellResolver, createToolSink } from "./tool-sink";
import type { ToolContext } from "./tool-strategy";
import { SpriteLayer } from "./layers";
import { createPreviewGame } from "./preview-game";
import { populateSampleGrid, sampleBounds } from "./sample-layout";
import { SpriteCameraSystem } from "./sprite-camera";
import { SpriteCheckerSystem } from "./sprite-checker";
import type { SpriteDocument } from "./sprite-document";
import type { SpriteEditorState } from "./sprite-editor-state";
import { SpriteGridSystem } from "./sprite-grid";
import { type HoverState, SpriteHoverSystem } from "./sprite-hover";
import { resolveWorldPixel } from "./tile-paint";

const GameViewPanel = ({
	doc,
	state,
	history,
	selection,
}: Readonly<{
	doc: SpriteDocument;
	state: SpriteEditorState;
	history: History;
	selection: SelectionController;
}>) => {
	const containerRef = useRef<HTMLDivElement>(null);
	// Rebuild on a dimension change (rotate) so the sample bounds re-read
	// `doc.width`/`height`; the composite canvas identity is stable across it.
	const dimensionsVersion = useSyncExternalStore(
		doc.subscribe,
		() => doc.dimensionsVersion,
	);

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
			new TilesetPreviewSystem(grid, doc.canvas, SpriteLayer.CONTENT),
		);
		scene.ecs.addRenderSystem(
			new SpriteHoverSystem(SpriteLayer.CONTENT, hover, state, false),
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

		const cursorAuthority = new CursorAuthority(element);
		const cursorToken = cursorAuthority.request("default");
		let overImage = false;
		const gesture = new GestureController();

		const worldOf = (e: PointerEvent): Vector2 | null => {
			const camera = pickActiveCamera2D(scene.ecs);
			if (!camera) {
				return null;
			}
			const canvas = clientToCanvas(element, e.clientX, e.clientY);
			return camera.screenToWorld(new Vector2(canvas.x, canvas.y));
		};

		const resolveAt = (wx: number, wy: number) => {
			const rows = Math.max(1, Math.round(doc.height / srcSize));
			return resolveWorldPixel(grid, rows, srcSize, wx, wy, (x, y) =>
				doc.alphaAt(x, y),
			);
		};

		// The tool works in tile-cell space; the resolver maps each cell back to
		// its source pixel via the sample layout, and the shared sink writes it
		// through the active ink and symmetry.
		const resolver: CellResolver = (cx, cy) => {
			const pixel = resolveAt(cx + 0.5, cy + 0.5);
			return pixel ? { x: pixel.x, y: pixel.y } : null;
		};
		const sink = createToolSink(doc, state, resolver);

		const context = (
			x: number,
			y: number,
			overImg: boolean,
			button: number,
			pressure: number,
			pointerId: number,
			capture: () => void,
			shiftKey: boolean,
			altKey: boolean,
		): ToolContext => ({
			doc,
			state,
			history,
			selection,
			shiftKey,
			altKey,
			x,
			y,
			overImage: overImg,
			button,
			pressure,
			pointerId,
			capture,
			paint: sink.paint,
			erase: sink.erase,
			sample: sink.sample,
		});

		const eventContext = (
			e: PointerEvent,
			tx: number,
			ty: number,
			world: Vector2 | null,
		): ToolContext =>
			context(
				tx,
				ty,
				world ? worldInBounds(world) : false,
				e.button,
				e.pressure,
				e.pointerId,
				() => element.setPointerCapture(e.pointerId),
				e.shiftKey,
				e.altKey,
			);

		const synthContext = (): ToolContext =>
			context(
				hover.x,
				hover.y,
				overImage,
				-1,
				0,
				-1,
				() => {},
				false,
				false,
			);

		const refreshHover = () => {
			const tool = getTool(state.tool);
			cursorToken.update(tool.cursor(overImage));
			hover.active =
				(tool.preview?.(synthContext())?.brushCell ?? false) &&
				overImage;
		};

		let lastToolId = state.tool;
		const onStateChange = () => {
			const toolId = state.tool;
			if (toolId !== lastToolId) {
				lastToolId = toolId;
				gesture.syncTool(toolId, synthContext());
			}
			refreshHover();
		};
		refreshHover();
		const unsubTool = state.subscribe(onStateChange);

		const onPointerDown = (e: PointerEvent) => {
			const world = worldOf(e);
			if (!world) {
				return;
			}
			const tx = Math.floor(world.x);
			const ty = Math.floor(world.y);
			hover.x = tx;
			hover.y = ty;
			overImage = worldInBounds(world);
			gesture.down(
				getTool(state.tool),
				eventContext(e, tx, ty, world),
			);
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
			refreshHover();
			gesture.move(eventContext(e, tx, ty, world));
		};
		const onPointerUp = (e: PointerEvent) => {
			gesture.up(eventContext(e, hover.x, hover.y, worldOf(e)));
		};
		const onPointerCancel = (e: PointerEvent) => {
			gesture.cancel(eventContext(e, hover.x, hover.y, worldOf(e)));
		};
		const onLostCapture = () => {
			gesture.cancel(synthContext());
		};
		const onLeave = () => {
			hover.active = false;
			overImage = false;
			refreshHover();
		};

		element.addEventListener("pointerdown", onPointerDown);
		element.addEventListener("pointermove", onPointerMove);
		element.addEventListener("pointerup", onPointerUp);
		element.addEventListener("pointercancel", onPointerCancel);
		element.addEventListener("lostpointercapture", onLostCapture);
		element.addEventListener("pointerleave", onLeave);

		return () => {
			element.removeEventListener("pointerdown", onPointerDown);
			element.removeEventListener("pointermove", onPointerMove);
			element.removeEventListener("pointerup", onPointerUp);
			element.removeEventListener("pointercancel", onPointerCancel);
			element.removeEventListener(
				"lostpointercapture",
				onLostCapture,
			);
			element.removeEventListener("pointerleave", onLeave);
			gesture.cancel(synthContext());
			doc.cancelStroke();
			unsubTool();
			cursorToken.dispose();
			cursorAuthority.dispose();
			unsub();
			stop();
			detach();
		};
	}, [doc, state, history, selection, dimensionsVersion]);

	return (
		<div ref={containerRef} className={styles.spriteCanvasHost} />
	);
};

export default GameViewPanel;
