import { useEffect, useRef, useSyncExternalStore } from "react";
import { pickActiveCamera2D } from "../../engine/camera/camera-2d-render";
import { SHEET_COLUMNS } from "../../engine/tilemap/autotile";
import Vector2 from "../../engine/vector2";
import styles from "./sprite-editor.module.scss";
import { CursorAuthority } from "../../engine/cursor/cursor-authority";
import { clientToCanvas } from "../client-to-canvas";
import type { DocumentViewState } from "../document/document-view-state";
import type { History } from "../history";
import { GestureController } from "./gesture-controller";
import type { SelectionController } from "./selection-controller";
import { SelectionRenderSystem } from "./selection-render-system";
import { getTool } from "./tool-registry";
import { createToolSink } from "./tool-sink";
import type { ToolContext } from "./tool-strategy";
import { SpriteLayer } from "./layers";
import type { OnionState } from "./onion-state";
import { createPreviewGame } from "./preview-game";
import { SpriteCameraSystem } from "./sprite-camera";
import { SpriteCheckerSystem } from "./sprite-checker";
import { SpriteAttachmentRenderSystem } from "./sprite-attachment-render-system";
import type { SpriteDocument } from "./sprite-document";
import type { SpriteEditorState } from "./sprite-editor-state";
import { SpriteOnionRenderSystem } from "./sprite-onion-render-system";
import { SpriteGridSystem } from "./sprite-grid";
import { type HoverState, SpriteHoverSystem } from "./sprite-hover";
import { SpriteImageRenderSystem } from "./sprite-image-render";

const TexturePanel = ({
	doc,
	state,
	history,
	selection,
	onion,
	viewState,
	isTileset,
}: Readonly<{
	doc: SpriteDocument;
	state: SpriteEditorState;
	history: History;
	selection: SelectionController;
	onion: OnionState;
	viewState: DocumentViewState;
	isTileset: boolean;
}>) => {
	const containerRef = useRef<HTMLDivElement>(null);
	// The camera pose is restored on a fresh mount (a cross-window move) but must
	// re-fit whenever the preview game is rebuilt in place — a document reload or
	// a rotate (dimensions change). Detecting a genuine re-init (vs. the initial
	// mount, and StrictMode's re-invoke where the identity is unchanged) and
	// clearing the recorded pose makes the system fall back to fitting the bounds.
	const reinitRef = useRef<{
		doc: SpriteDocument;
		dims: number;
	} | null>(null);
	// Rebuild the preview game when the canvas dimensions change (a rotate), so
	// the camera bounds, checker and grid re-read `doc.width`/`height`. The
	// composite canvas object identity is stable across the change.
	const dimensionsVersion = useSyncExternalStore(
		doc.subscribe,
		() => doc.dimensionsVersion,
	);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		const prev = reinitRef.current;
		if (
			prev &&
			(prev.doc !== doc || prev.dims !== dimensionsVersion)
		) {
			viewState.clearCamera();
		}
		reinitRef.current = { doc, dims: dimensionsVersion };

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
				viewState,
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
			new SpriteOnionRenderSystem(doc, onion, SpriteLayer.ONION),
		);
		scene.ecs.addRenderSystem(
			new SpriteImageRenderSystem(doc, SpriteLayer.CONTENT),
		);
		scene.ecs.addRenderSystem(
			new SpriteHoverSystem(SpriteLayer.CONTENT, hover, state),
		);
		scene.ecs.addRenderSystem(
			new SpriteAttachmentRenderSystem(
				SpriteLayer.CONTENT,
				doc,
				state,
			),
		);
		scene.ecs.addRenderSystem(
			new SpriteGridSystem(SpriteLayer.CONTENT, tileSize, {
				x: 0,
				y: 0,
				width: doc.width,
				height: doc.height,
			}),
		);
		if (!isTileset) {
			scene.ecs.addRenderSystem(
				new SelectionRenderSystem(
					SpriteLayer.SELECTION,
					selection,
					doc.width,
					doc.height,
				),
			);
		}

		const stop = game.start();
		const unsub = doc.subscribe(() => {
			game.renderer.invalidateImage(doc.canvas);
		});

		const cursorAuthority = new CursorAuthority(element);
		const cursorToken = cursorAuthority.request("default");
		let overImage = false;
		const gesture = new GestureController();

		const sink = createToolSink(doc, state);

		const context = (
			x: number,
			y: number,
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
			overImage: inBounds(x, y),
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
			x: number,
			y: number,
		): ToolContext =>
			context(
				x,
				y,
				e.button,
				e.pressure,
				e.pointerId,
				() => element.setPointerCapture(e.pointerId),
				e.shiftKey,
				e.altKey,
			);

		// A pointer-less context for refreshes and cancellations that are not
		// driven by an event (tool change, capture loss, teardown): the last
		// hovered cell, no button, no pointer id.
		const synthContext = (): ToolContext =>
			context(hover.x, hover.y, -1, 0, -1, () => {}, false, false);

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
				// A tool switch is an unrelated action: fold any uncommitted float
				// into the cel before handing the gesture over.
				selection.commit();
				gesture.syncTool(toolId, synthContext());
				// Entering the free-transform tool begins a transform on the current
				// selection so the gizmo appears immediately (no first click needed).
				if (toolId === "transform") {
					selection.beginTransform();
				}
			}
			refreshHover();
		};
		refreshHover();
		const unsubTool = state.subscribe(onStateChange);

		const pixelAt = (
			e: PointerEvent,
		): { x: number; y: number } | null => {
			const camera = pickActiveCamera2D(scene.ecs);
			if (!camera) {
				return null;
			}
			const canvas = clientToCanvas(element, e.clientX, e.clientY);
			const world = camera.screenToWorld(
				new Vector2(canvas.x, canvas.y),
			);
			return { x: Math.floor(world.x), y: Math.floor(world.y) };
		};

		const onPointerDown = (e: PointerEvent) => {
			const p = pixelAt(e);
			if (!p) {
				return;
			}
			hover.x = p.x;
			hover.y = p.y;
			overImage = inBounds(p.x, p.y);
			gesture.down(getTool(state.tool), eventContext(e, p.x, p.y));
		};

		const onPointerMove = (e: PointerEvent) => {
			const p = pixelAt(e);
			if (!p) {
				return;
			}
			hover.x = p.x;
			hover.y = p.y;
			overImage = inBounds(p.x, p.y);
			refreshHover();
			gesture.move(eventContext(e, p.x, p.y));
		};

		const onPointerUp = (e: PointerEvent) => {
			gesture.up(eventContext(e, hover.x, hover.y));
		};

		const onPointerCancel = (e: PointerEvent) => {
			gesture.cancel(eventContext(e, hover.x, hover.y));
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
	}, [
		doc,
		state,
		history,
		selection,
		onion,
		viewState,
		isTileset,
		dimensionsVersion,
	]);

	return (
		<div ref={containerRef} className={styles.spriteCanvasHost} />
	);
};

export default TexturePanel;
