import { Menu } from "@base-ui/react/menu";
import {
	DownloadSimpleIcon,
	PlusIcon,
	SwapIcon,
	TrashIcon,
	UploadSimpleIcon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import { useState, useSyncExternalStore } from "react";
import { oklchToRgb255, rgbToOklch } from "../color/oklch";
import type { History } from "../history";
import {
	openFileDialog,
	readTextFile,
	uploadAsset,
} from "../project-io";
import Button from "../button";
import controls from "../styles/controls.module.scss";
import surface from "../styles/surface.module.scss";
import Tooltip from "../tooltip";
import { usePortalContainer } from "../window/portal-container";
import { parseGpl, serializeGpl } from "./gpl-palette";
import { parseHex, serializeHex } from "./hex-palette";
import {
	type PaletteColor,
	paletteColor,
	paletteColorToCss,
	paletteColorToHex,
	paletteColorsEqual,
} from "./palette-color";
import { spritePalette } from "./palette-state";
import { replaceActiveCelColor } from "./replace-color-command";
import type { SpriteDocument } from "./sprite-document";
import type { SpriteEditorState } from "./sprite-editor-state";
import styles from "./palette-panel.module.scss";

/** The editor's active colour projected to an opaque palette entry. */
const activePaletteColor = (
	state: SpriteEditorState,
): PaletteColor => {
	const [r, g, b] = oklchToRgb255(state.l, state.c, state.h);
	return paletteColor(r, g, b);
};

/**
 * What is being drag-reordered, module-side because the HTML5 `dragover` phase
 * cannot read the `dataTransfer` payload — mirrors the timeline's DnD approach.
 */
let dragIndex: number | null = null;

/**
 * The working-palette panel: an ordered grid of swatches over the shared
 * {@link spritePalette}. Click a swatch to set the active editor colour; add the
 * current colour, remove or reorder (drag) entries; replace a colour across the
 * active cel; and import/export `.gpl` (GIMP) or `.hex` (Lospec) palettes.
 *
 * The palette is editor working state, not part of the `.bsprite` document
 * (palette/indexed colour is deferred in the format), so it is shared across all
 * open sprite editors and persisted to `localStorage`.
 *
 * Docked as a floating panel in the sprite body (bottom-left, mirroring the
 * attachment panel top-left) — a conventional minimal placement flagged for user
 * feedback.
 */
const PalettePanel = ({
	doc,
	history,
	state,
}: Readonly<{
	doc: SpriteDocument;
	history: History;
	state: SpriteEditorState;
}>) => {
	useSyncExternalStore(
		spritePalette.subscribe,
		() => spritePalette.version,
	);
	useSyncExternalStore(state.subscribe, () => state.css);
	const [selected, setSelected] = useState<number | null>(null);
	const container = usePortalContainer();

	const colors = spritePalette.colors;
	const active = activePaletteColor(state);

	const pick = (index: number) => {
		setSelected(index);
		const color = colors[index]!;
		const { l, c, h } = rgbToOklch(color.r, color.g, color.b);
		state.setColor({ l, c, h, alpha: 1 });
	};

	const addCurrent = () => {
		setSelected(colors.length);
		spritePalette.add(active);
	};

	const removeSelected = () => {
		if (selected === null) {
			return;
		}
		spritePalette.removeAt(selected);
		setSelected(null);
	};

	const replaceInImage = () => {
		if (selected === null) {
			return;
		}
		const from = colors[selected]!;
		const [r, g, b] = oklchToRgb255(state.l, state.c, state.h);
		replaceActiveCelColor(
			doc.core,
			history,
			[from.r, from.g, from.b, 255],
			[r, g, b, Math.round(state.alpha * 255)],
		);
	};

	const importFrom = (
		accept: string,
		parse: (text: string) => ReadonlyArray<PaletteColor>,
	) => {
		void (async () => {
			const path = await openFileDialog(accept);
			if (!path) {
				return;
			}
			try {
				const parsed = parse(await readTextFile(path));
				if (parsed.length > 0) {
					spritePalette.replace(parsed);
					setSelected(null);
				} else {
					window.alert("No colours found in that file.");
				}
			} catch {
				window.alert(`Could not read a palette from "${path}".`);
			}
		})();
	};

	const exportTo = (ext: string, text: string) => {
		void (async () => {
			const result = await uploadAsset(
				`palette${ext}`,
				new Blob([text]),
				true,
			);
			window.alert(`Palette exported to ${result.url}`);
		})();
	};

	return (
		<div className={styles.panel}>
			<div className={styles.header}>
				<span className={styles.heading}>Palette</span>
				<Tooltip label="Add current colour">
					<Button
						variant="icon"
						onClick={addCurrent}
						aria-label="Add current colour"
					>
						<PlusIcon weight="bold" />
					</Button>
				</Tooltip>
				<Tooltip label="Remove selected colour">
					<Button
						variant="icon"
						disabled={selected === null}
						onClick={removeSelected}
						aria-label="Remove selected colour"
					>
						<TrashIcon />
					</Button>
				</Tooltip>
				<Tooltip label="Replace selected colour with the current colour (active cel)">
					<Button
						variant="icon"
						disabled={selected === null}
						onClick={replaceInImage}
						aria-label="Replace selected colour in the active cel"
					>
						<SwapIcon />
					</Button>
				</Tooltip>
				<Menu.Root>
					<Tooltip label="Import palette">
						<Menu.Trigger
							className={controls.iconButton}
							aria-label="Import palette"
						>
							<UploadSimpleIcon />
						</Menu.Trigger>
					</Tooltip>
					<Menu.Portal container={container}>
						<Menu.Positioner sideOffset={8} align="end">
							<Menu.Popup
								className={clsx(surface.surface, surface.menu)}
							>
								<Menu.Item
									className={surface.item}
									onClick={() =>
										importFrom(".gpl", (t) => parseGpl(t).colors)
									}
								>
									Import .gpl…
								</Menu.Item>
								<Menu.Item
									className={surface.item}
									onClick={() => importFrom(".hex", parseHex)}
								>
									Import .hex (Lospec)…
								</Menu.Item>
							</Menu.Popup>
						</Menu.Positioner>
					</Menu.Portal>
				</Menu.Root>
				<Menu.Root>
					<Tooltip label="Export palette">
						<Menu.Trigger
							className={controls.iconButton}
							disabled={colors.length === 0}
							aria-label="Export palette"
						>
							<DownloadSimpleIcon />
						</Menu.Trigger>
					</Tooltip>
					<Menu.Portal container={container}>
						<Menu.Positioner sideOffset={8} align="end">
							<Menu.Popup
								className={clsx(surface.surface, surface.menu)}
							>
								<Menu.Item
									className={surface.item}
									onClick={() =>
										exportTo(".gpl", serializeGpl(colors))
									}
								>
									Export .gpl…
								</Menu.Item>
								<Menu.Item
									className={surface.item}
									onClick={() =>
										exportTo(".hex", serializeHex(colors))
									}
								>
									Export .hex…
								</Menu.Item>
							</Menu.Popup>
						</Menu.Positioner>
					</Menu.Portal>
				</Menu.Root>
			</div>
			{colors.length === 0 ? (
				<p className={styles.empty}>
					Add the current colour, or import a .gpl / .hex palette.
				</p>
			) : (
				<div className={styles.swatches}>
					{colors.map((color, index) => (
						<button
							key={`${index}-${paletteColorToHex(color)}`}
							type="button"
							className={clsx(
								styles.swatch,
								selected === index && styles.swatchSelected,
								paletteColorsEqual(color, active) &&
									styles.swatchActive,
							)}
							style={{ background: paletteColorToCss(color) }}
							title={paletteColorToHex(color)}
							aria-label={`Palette colour ${paletteColorToHex(color)}`}
							draggable
							onClick={() => pick(index)}
							onDragStart={() => {
								dragIndex = index;
							}}
							onDragOver={(e) => {
								if (dragIndex !== null) {
									e.preventDefault();
								}
							}}
							onDrop={(e) => {
								e.preventDefault();
								if (dragIndex !== null && dragIndex !== index) {
									spritePalette.move(dragIndex, index);
									setSelected(null);
								}
								dragIndex = null;
							}}
							onDragEnd={() => {
								dragIndex = null;
							}}
						/>
					))}
				</div>
			)}
		</div>
	);
};

export default PalettePanel;
