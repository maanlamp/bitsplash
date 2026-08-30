import { ArrowUUpLeftIcon } from "@phosphor-icons/react/dist/icons/ArrowUUpLeft";
import { ArrowUUpRightIcon } from "@phosphor-icons/react/dist/icons/ArrowUUpRight";
import { useEffect, useRef, useState } from "react";
import { useScopedHotkeys } from "../window/use-scoped-hotkeys";
import { useWindowWindow } from "../window/window-context";
import {
	SHEET_COLUMNS,
	isValidTilesetWidth,
} from "../../engine/tilemap/autotile";
import { isBspriteUrl } from "../../engine/sprite/sprite-asset-cache";
import {
	invalidateImageEverywhere,
	invalidateTileArrayEverywhere,
} from "../../engine/render/renderer-registry";
import { assetFilename } from "../assets";
import { useAssetManager } from "../asset-manager-context";
import Button from "../button";
import { invalidateUrlEverywhere } from "../pick-index";
import { readAssetBytes, uploadAsset } from "../project-io";
import { toastError } from "../toast";
import FloatingToolbar from "../floating-toolbar";
import controls from "../styles/controls.module.scss";
import Tooltip, { TooltipProvider } from "../tooltip";
import Split from "../workspace/split";
import { makeViewId, NEW_PARAM } from "../workspace/view-registry";
import { useDocumentEditor } from "../use-document-editor";
import AttachmentPanel from "./attachment-panel";
import { snapshotFromDocument } from "./bsprite-document-adapter";
import {
	type DocumentSnapshot,
	serializeBsprite,
} from "./bsprite-writer";
import ColorPicker from "./color-picker";
import GameViewPanel from "./game-view-panel";
import PalettePanel from "./palette-panel";
import Timeline from "./timeline";
import { adjacentLayerId, clampedIndex } from "./timeline-navigation";
import { OnionState } from "./onion-state";
import { SelectionController } from "./selection-controller";
import SpritePreviewPanel from "./sprite-preview-panel";
import { SpriteDocument } from "./sprite-document";
import { SpriteEditorState } from "./sprite-editor-state";
import styles from "./sprite-editor.module.scss";
import SpriteViewToolbar from "./sprite-view-toolbar";
import {
	flipHorizontal as flipHorizontalCommand,
	flipVertical as flipVerticalCommand,
	wrapShiftCel,
} from "./transform-commands";
import { TOOL_REGISTRY } from "./tool-registry";
import TexturePanel from "./texture-panel";
import ToolOptions from "./tool-options";
import ToolPanel from "./tool-panel";
import TransformPanel from "./transform-panel";

export type NewSpriteConfig = Readonly<{
	filename: string;
	width: number;
	height: number;
}>;

/**
 * The selection tools bind Alt to "subtract from selection", so the global
 * hold-Alt=eyedropper shortcut must yield to them while one is active.
 */
const SELECTION_TOOLS = new Set([
	"marquee",
	"lasso",
	"wand",
	"move",
	"transform",
]);

/**
 * Whether keyboard focus is in a field that owns the arrow keys (a text input,
 * textarea, or contenteditable — e.g. the timeline's frame-duration
 * {@link NumberField}), so the timeline's arrow-key cel navigation must yield
 * rather than steal the caret movement.
 */
const isEditableTarget = (): boolean => {
	const el = document.activeElement;
	if (!(el instanceof HTMLElement)) {
		return false;
	}
	const tag = el.tagName;
	return (
		tag === "INPUT" ||
		tag === "TEXTAREA" ||
		tag === "SELECT" ||
		el.isContentEditable
	);
};

const serialize = (
	document: SpriteDocument,
	snapshot: DocumentSnapshot,
): Uint8Array =>
	serializeBsprite(snapshot, {
		previous: document.previousArchive ?? undefined,
		isCelDirty: (layerId, frame) =>
			document.isCelDirty(layerId, frame),
		isBakeDirty: (frame) => document.isBakeDirty(frame),
	});

const SpriteEditor = ({
	assetUrl,
	isTileset,
	create,
	onDirty,
	onCreated,
	active,
}: Readonly<{
	assetUrl: string | null;
	isTileset: boolean;
	create: NewSpriteConfig | null;
	onDirty: (dirty: boolean) => void;
	onCreated: (url: string) => void;
	active: boolean;
}>) => {
	const [selection, setSelection] =
		useState<SelectionController | null>(null);
	const win = useWindowWindow();
	const assetManager = useAssetManager();
	const { doc, history, controllers, viewState, undoable } =
		useDocumentEditor(makeViewId("sprite", assetUrl ?? NEW_PARAM), {
			loadKey: [
				assetUrl,
				create?.filename,
				create?.width,
				create?.height,
			],
			load: async () => {
				if (assetUrl === null) {
					return new SpriteDocument(
						create?.width ?? 32,
						create?.height ?? 32,
					);
				}
				if (isBspriteUrl(assetUrl)) {
					const bytes = await readAssetBytes(assetUrl);
					return SpriteDocument.fromBsprite(new Uint8Array(bytes));
				}
				return SpriteDocument.load(assetUrl);
			},
			createControllers: () => ({
				state: new SpriteEditorState(),
				onion: new OnionState(),
			}),
			onDirty,
			active,
		});
	const { state, onion } = controllers;

	// The selection controller owns the marquee/floating state and registers the
	// B12 choke-point bridges on the document; it is scoped to one document, so a
	// reload builds a fresh one and disposes the old.
	useEffect(() => {
		if (!doc) {
			setSelection(null);
			return;
		}
		const controller = new SelectionController(doc, history);
		setSelection(controller);
		return () => {
			controller.dispose();
			setSelection(null);
		};
	}, [doc, history]);

	// A tileset's width must be an exact multiple of SHEET_COLUMNS for its autotile
	// columns to line up; the new-tileset dialog snaps to a valid width, but a
	// document loaded from disk (hand-edited, imported, or renamed to a tileset)
	// can violate it. Surface that non-blockingly via the shared toast so the file
	// still opens and stays editable — a flagged UX choice (no modal/blocking).
	useEffect(() => {
		if (doc && isTileset && !isValidTilesetWidth(doc.width)) {
			toastError(
				`Tileset width ${doc.width}px is not a multiple of ${SHEET_COLUMNS}; autotile columns won't line up.`,
			);
		}
	}, [doc, isTileset]);

	useScopedHotkeys(
		TOOL_REGISTRY.map((t) => t.shortcut).join(","),
		(_e, handler) => {
			const key = handler.keys?.[0];
			const entry = TOOL_REGISTRY.find((t) => t.shortcut === key);
			if (entry) {
				state.setTool(entry.id);
			}
		},
		{ enabled: active },
		[state, active],
	);

	// Hold-key temporary tool switch (experiment): holding Space activates the
	// pan tool and releasing restores the previous tool, matching the muscle
	// memory from Aseprite/Photoshop. The ref guards against keydown auto-repeat
	// pushing the tool more than once per physical hold.
	const spaceHeld = useRef(false);
	useScopedHotkeys(
		"space",
		(e) => {
			if (e.type === "keydown") {
				if (!spaceHeld.current) {
					spaceHeld.current = true;
					state.pushTemporaryTool("pan");
				}
			} else if (spaceHeld.current) {
				spaceHeld.current = false;
				state.popTemporaryTool();
			}
		},
		{
			enabled: active,
			keydown: true,
			keyup: true,
			preventDefault: true,
		},
		[state, active],
	);

	// Hold-Alt temporarily switches to the eyedropper and restores the previous
	// tool on release (push/pop, like hold-Space=pan). Bound on `window` rather
	// than react-hotkeys-hook because Alt is a bare modifier; the ref guards
	// against keydown auto-repeat re-pushing within one physical hold.
	const altHeld = useRef(false);
	useEffect(() => {
		if (!active) {
			return;
		}
		const onKeyDown = (e: KeyboardEvent) => {
			if (
				e.key === "Alt" &&
				!altHeld.current &&
				!SELECTION_TOOLS.has(state.tool)
			) {
				altHeld.current = true;
				state.pushTemporaryTool("eyedropper");
			}
		};
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.key === "Alt" && altHeld.current) {
				altHeld.current = false;
				state.popTemporaryTool();
			}
		};
		win.addEventListener("keydown", onKeyDown);
		win.addEventListener("keyup", onKeyUp);
		return () => {
			win.removeEventListener("keydown", onKeyDown);
			win.removeEventListener("keyup", onKeyUp);
		};
	}, [active, state, win]);

	// A hold-key's keyup is delivered to whichever window has focus. If focus
	// leaves mid-hold (alt-tab), the keyup never reaches the handlers above and
	// the temporary tool would strand on top of the stack forever — the brush
	// and eraser would appear permanently dead. Resetting on blur makes that
	// unreachable: every hold is released the moment focus is lost.
	useEffect(() => {
		const onBlur = () => {
			spaceHeld.current = false;
			altHeld.current = false;
			state.clearTemporaryTools();
		};
		win.addEventListener("blur", onBlur);
		return () => win.removeEventListener("blur", onBlur);
	}, [state, win]);

	/**
	 * Hot reload after a save: evict the URL on the shared editor asset manager
	 * (scene views and the tag-playback/render systems re-poll it and self-heal),
	 * free the old GPU texture in every live renderer, and dirty every open view's
	 * pick index so derived bounds recompute (plan A5).
	 */
	const hotReload = (url: string): void => {
		if (!assetManager) {
			return;
		}
		const previous = assetManager.sprites.get(url);
		assetManager.evict(url);
		if (previous) {
			invalidateImageEverywhere(previous.image);
			invalidateTileArrayEverywhere(previous.image);
		}
		invalidateUrlEverywhere(url);
	};

	const save = async () => {
		if (!doc) {
			return;
		}
		// Saving is an unrelated action: fold any uncommitted floating selection
		// into the cel (one undo entry) before serializing.
		doc.commitPendingFloatingEdit();
		// Create a brand-new .bsprite (blank one-frame document). A tileset carries
		// a manifest tileset block so the engine classifies it by manifest.
		if (assetUrl === null) {
			if (!create) {
				return;
			}
			const snapshot: DocumentSnapshot = isTileset
				? {
						...snapshotFromDocument(doc),
						tileset: { columns: SHEET_COLUMNS },
					}
				: snapshotFromDocument(doc);
			const bytes = serialize(doc, snapshot);
			const result = await uploadAsset(
				create.filename,
				new Blob([bytes as BlobPart]),
				false,
			);
			if (result.existed) {
				window.alert(`"${create.filename}" already exists.`);
				return;
			}
			doc.adoptSavedArchive(bytes);
			doc.markSaved();
			onCreated(result.url);
			return;
		}
		// A legacy PNG opened as a single-frame document is saved as a NEW .bsprite
		// with the same basename (silent convert — a flagged UX choice), then
		// reopened as the .bsprite.
		if (!isBspriteUrl(assetUrl)) {
			const filename = `${assetFilename(assetUrl).replace(
				/\.[^.]+$/,
				"",
			)}.bsprite`;
			const bytes = serialize(doc, snapshotFromDocument(doc));
			const result = await uploadAsset(
				filename,
				new Blob([bytes as BlobPart]),
				false,
			);
			if (result.existed) {
				window.alert(`"${filename}" already exists.`);
				return;
			}
			doc.adoptSavedArchive(bytes);
			doc.markSaved();
			hotReload(result.url);
			onCreated(result.url);
			return;
		}
		// Overwrite the existing .bsprite in place.
		const bytes = serialize(doc, snapshotFromDocument(doc));
		await uploadAsset(
			assetFilename(assetUrl),
			new Blob([bytes as BlobPart]),
			true,
		);
		doc.adoptSavedArchive(bytes);
		doc.markSaved();
		hotReload(assetUrl);
	};

	useScopedHotkeys(
		"mod+s",
		(e) => {
			e.preventDefault();
			void save();
		},
		{ preventDefault: true, enabled: active },
		[active, doc, assetUrl, create],
	);

	// Selection commit/cancel and internal clipboard. Enter stamps a floating
	// selection into the cel; Escape cancels the float or clears the marquee.
	// Copy/cut/paste route through the internal editor clipboard.
	useScopedHotkeys(
		"enter",
		() => selection?.confirmOrCommit(),
		{ enabled: active },
		[active, selection],
	);
	useScopedHotkeys(
		"escape",
		() => selection?.escape(),
		{ enabled: active },
		[active, selection],
	);
	useScopedHotkeys(
		"mod+c",
		() => selection?.copy(),
		{ enabled: active },
		[active, selection],
	);
	useScopedHotkeys(
		"mod+x",
		() => selection?.cut(),
		{ enabled: active },
		[active, selection],
	);
	useScopedHotkeys(
		"mod+v",
		() => selection?.paste(),
		{ enabled: active },
		[active, selection],
	);

	// Ctrl/Cmd+T opens the free-transform gizmo on the current selection (the
	// conventional transform shortcut — a flagged default). Switching to the
	// transform tool auto-begins the session; calling begin here covers the case
	// where the tool is already active.
	useScopedHotkeys(
		"mod+t",
		(e) => {
			e.preventDefault();
			state.setTool("transform");
			selection?.beginTransform();
		},
		{ enabled: active, preventDefault: true },
		[active, state, selection],
	);

	// Flip the active selection (or, with none, the whole image). Shift+H/V match
	// the conventional pixel-editor flip shortcuts; rotate-90 stays toolbar-only.
	useScopedHotkeys(
		"shift+h",
		() => doc && flipHorizontalCommand(doc, history, selection),
		{ enabled: active },
		[active, doc, history, selection],
	);
	useScopedHotkeys(
		"shift+v",
		() => doc && flipVerticalCommand(doc, history, selection),
		{ enabled: active },
		[active, doc, history, selection],
	);

	// Wrap-around shift of the active cel (seamless-tile tool): Shift+arrows move
	// the pixels one cell, wrapping across the opposite edge, one undo entry each.
	useScopedHotkeys(
		"shift+left,shift+right,shift+up,shift+down",
		(e) => {
			if (!doc || isEditableTarget()) {
				return;
			}
			e.preventDefault();
			switch (e.key) {
				case "ArrowLeft":
					wrapShiftCel(doc, history, -1, 0);
					break;
				case "ArrowRight":
					wrapShiftCel(doc, history, 1, 0);
					break;
				case "ArrowUp":
					wrapShiftCel(doc, history, 0, -1);
					break;
				case "ArrowDown":
					wrapShiftCel(doc, history, 0, 1);
					break;
			}
		},
		{ enabled: active, preventDefault: true },
		[active, doc, history],
	);

	// Arrow keys move the active cel through the frames × layers matrix instead
	// of scrolling the grid: left/right step the frame, up/down step the layer in
	// display order (up = the layer shown above). `preventDefault` suppresses the
	// grid scroll; the guard yields the keys to a focused field's caret.
	useScopedHotkeys(
		"up,down,left,right",
		(e) => {
			if (!doc || isEditableTarget() || e.shiftKey) {
				return;
			}
			e.preventDefault();
			switch (e.key) {
				case "ArrowLeft":
					doc.setActiveFrame(
						clampedIndex(doc.activeFrameIndex, -1, doc.frames.length),
					);
					break;
				case "ArrowRight":
					doc.setActiveFrame(
						clampedIndex(doc.activeFrameIndex, 1, doc.frames.length),
					);
					break;
				case "ArrowUp":
				case "ArrowDown": {
					const displayIds = [...doc.layers]
						.toReversed()
						.map((l) => l.id);
					doc.setActiveLayer(
						adjacentLayerId(
							displayIds,
							doc.activeLayerId,
							e.key === "ArrowUp" ? -1 : 1,
						),
					);
					break;
				}
			}
		},
		{ preventDefault: true, enabled: active },
		[doc, active],
	);

	return (
		<div className={styles.spriteEditor}>
			<TooltipProvider>
				<Split
					direction="column"
					initial={[0.72, 0.28]}
					storageKey="sprite-split-timeline"
				>
					<div className={styles.spriteMain}>
						{doc && (
							<SpriteViewToolbar
								doc={doc}
								history={history}
								selection={selection}
								state={state}
							/>
						)}
						<div className={styles.spriteBody}>
							{doc && selection ? (
								isTileset ? (
									<Split
										direction="row"
										initial={[0.5, 0.5]}
										storageKey="sprite-split-view"
									>
										<div className={styles.spritePanel}>
											<TexturePanel
												doc={doc}
												state={state}
												history={history}
												selection={selection}
												onion={onion}
												viewState={viewState}
												isTileset
											/>
										</div>
										<div className={styles.spritePanel}>
											<GameViewPanel
												doc={doc}
												state={state}
												history={history}
												selection={selection}
											/>
										</div>
									</Split>
								) : (
									<TexturePanel
										doc={doc}
										state={state}
										history={history}
										selection={selection}
										onion={onion}
										viewState={viewState}
										isTileset={false}
									/>
								)
							) : (
								<div className={controls.loading}>Loading…</div>
							)}
							<FloatingToolbar>
								<Tooltip label="Undo">
									<Button
										variant="icon"
										onClick={() => history.undo()}
										disabled={!undoable.canUndo}
									>
										<ArrowUUpLeftIcon />
									</Button>
								</Tooltip>
								<Tooltip label="Redo">
									<Button
										variant="icon"
										onClick={() => history.redo()}
										disabled={!undoable.canRedo}
									>
										<ArrowUUpRightIcon />
									</Button>
								</Tooltip>
								<div className={controls.toolbarSeparator} />
								<ColorPicker state={state} />
								<ToolPanel state={state} />
								<div className={controls.toolbarSeparator} />
								<ToolOptions state={state} />
							</FloatingToolbar>
							{doc && <SpritePreviewPanel doc={doc} />}
							{doc && (
								<PalettePanel
									doc={doc}
									history={history}
									state={state}
								/>
							)}
							{doc && !isTileset && (
								<AttachmentPanel
									doc={doc}
									history={history}
									state={state}
								/>
							)}
							{selection && !isTileset && (
								<TransformPanel selection={selection} />
							)}
						</div>
					</div>
					<div className={styles.spriteTimeline}>
						{doc && (
							<Timeline
								doc={doc}
								history={history}
								onion={onion}
								viewState={viewState}
							/>
						)}
					</div>
				</Split>
			</TooltipProvider>
		</div>
	);
};

export default SpriteEditor;
