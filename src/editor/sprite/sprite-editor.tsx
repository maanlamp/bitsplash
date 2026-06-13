import {
	ArrowUUpLeftIcon,
	ArrowUUpRightIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { assetFilename } from "../assets";
import Button from "../button";
import FloatingToolbar from "../floating-toolbar";
import controls from "../styles/controls.module.scss";
import Tooltip, { TooltipProvider } from "../tooltip";
import Split from "../workspace/split";
import { useDocumentEditor } from "../use-document-editor";
import ColorPicker from "./color-picker";
import GameViewPanel from "./game-view-panel";
import LayersPanel from "./layers-panel";
import { SpriteDocument } from "./sprite-document";
import { SpriteEditorState } from "./sprite-editor-state";
import styles from "./sprite-editor.module.scss";
import { SPRITE_TOOLS } from "./sprite-tools";
import TexturePanel from "./texture-panel";
import ToolPanel from "./tool-panel";

export type NewSpriteConfig = Readonly<{
	filename: string;
	width: number;
	height: number;
}>;

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
	const [state] = useState(() => new SpriteEditorState());
	const { doc, history, undoable } = useDocumentEditor({
		deps: [assetUrl, create?.filename, create?.width, create?.height],
		load: () =>
			assetUrl === null
				? new SpriteDocument(
						create?.width ?? 32,
						create?.height ?? 32,
					)
				: SpriteDocument.load(assetUrl),
		onDirty,
		active,
	});

	useHotkeys(
		SPRITE_TOOLS.map((t) => t.shortcut).join(","),
		(_e, handler) => {
			const key = handler.keys?.[0];
			const def = SPRITE_TOOLS.find((t) => t.shortcut === key);
			if (def) {
				state.setTool(def.id);
			}
		},
		{ enabled: active },
		[state, active],
	);

	const save = async () => {
		if (!doc) {
			return;
		}
		if (assetUrl === null) {
			if (!create) {
				return;
			}
			const response = await fetch("/__upload-asset", {
				method: "POST",
				headers: {
					"x-filename": create.filename,
					"x-overwrite": "false",
				},
				body: await doc.toBlob(),
			});
			if (response.status === 304) {
				window.alert(`"${create.filename}" already exists.`);
				return;
			}
			const data = (await response.json()) as { url: string };
			doc.markSaved();
			onCreated(data.url);
			return;
		}
		await fetch("/__upload-asset", {
			method: "POST",
			headers: {
				"x-filename": assetFilename(assetUrl),
				"x-overwrite": "true",
			},
			body: await doc.toBlob(),
		});
		doc.markSaved();
	};

	useHotkeys(
		"mod+s",
		(e) => {
			e.preventDefault();
			void save();
		},
		{ preventDefault: true, enabled: active },
		[active, doc, assetUrl, create],
	);

	return (
		<div className={styles.spriteEditor}>
			<TooltipProvider>
				<Split
					direction="row"
					initial={[0.22, 0.78]}
					storageKey="sprite-split-main"
				>
					<div className={styles.spriteToolbar}>
						{doc && <LayersPanel doc={doc} history={history} />}
					</div>
					<div className={styles.spriteMain}>
						<div className={styles.spriteBody}>
							{doc ? (
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
												isTileset
											/>
										</div>
										<div className={styles.spritePanel}>
											<GameViewPanel
												doc={doc}
												state={state}
												history={history}
											/>
										</div>
									</Split>
								) : (
									<TexturePanel
										doc={doc}
										state={state}
										history={history}
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
							</FloatingToolbar>
						</div>
					</div>
				</Split>
			</TooltipProvider>
		</div>
	);
};

export default SpriteEditor;
