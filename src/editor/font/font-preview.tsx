import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import {
	MagnifyingGlassMinusIcon,
	MagnifyingGlassPlusIcon,
} from "@phosphor-icons/react";
import classNames from "classnames";
import { useEffect, useRef, useState } from "react";
import type AssetManager from "../../engine/assets";
import { blitText, supportsChar } from "../../engine/font-blit";
import {
	type FontStyle,
	type LoadedFont,
	STYLE_BOLD,
	STYLE_BOLD_ITALIC,
	STYLE_ITALIC,
	STYLE_REGULAR,
} from "../../engine/load";
import { assetFilename } from "../assets";
import Button from "../button";
import controls from "../styles/controls.module.scss";
import Tooltip, { TooltipProvider } from "../tooltip";
import styles from "./font-preview.module.scss";

const DEFAULT_SIZE = 16;
const MIN_SIZE = 4;
const MAX_SIZE = 96;
const DEFAULT_ZOOM = 4;
const MIN_ZOOM = 1;
const MAX_ZOOM = 12;
const SIZE_DEBOUNCE_MS = 200;

export const fontStyleLabels = [
	"Regular",
	"Bold",
	"Italic",
	"Bold Italic",
] as const;

export type FontStyleLabel = (typeof fontStyleLabels)[number];

export const STYLE_OPTIONS: ReadonlyArray<
	Readonly<{ id: FontStyle; label: FontStyleLabel }>
> = [
	{ id: STYLE_REGULAR, label: "Regular" },
	{ id: STYLE_BOLD, label: "Bold" },
	{ id: STYLE_ITALIC, label: "Italic" },
	{ id: STYLE_BOLD_ITALIC, label: "Bold Italic" },
];

const chars = (...points: number[]): string[] =>
	points.map((p) => String.fromCharCode(p));

const LETTER_PAIRS = Array.from(
	{ length: 26 },
	(_, i) =>
		[
			String.fromCharCode(0x41 + i),
			String.fromCharCode(0x61 + i),
		] as const,
);
const DIGITS = chars(
	...Array.from({ length: 10 }, (_, i) => 0x30 + i),
);
const PUNCTUATION = chars(
	0x2e,
	0x2c,
	0x3a,
	0x3b,
	0x21,
	0x3f,
	0x27,
	0x22,
	0x60,
);
const BRACKETS = chars(
	0x28,
	0x29,
	0x5b,
	0x5d,
	0x7b,
	0x7d,
	0x3c,
	0x3e,
);
const SYMBOLS = chars(
	0x2b,
	0x2d,
	0x2a,
	0x2f,
	0x3d,
	0x25,
	0x5e,
	0x7e,
	0x7c,
	0x5c,
	0x26,
	0x40,
	0x23,
	0x24,
	0x5f,
);

const SYMBOL_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
	DIGITS,
	PUNCTUATION,
	BRACKETS,
	SYMBOLS,
];

const PANGRAMS: ReadonlyArray<string> = [
	"The jolly wizard brews exotic magic potions for quirky dwarves",
	"Pack my box with five dozen liquor jugs",
	"Woven silk pyjamas exchanged for blue quartz",
];

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

const useFamilies = (
	assetManager: AssetManager,
	url: string,
	size: number,
): ReadonlyArray<LoadedFont> | null => {
	const [families, setFamilies] =
		useState<ReadonlyArray<LoadedFont> | null>(null);
	useEffect(() => {
		setFamilies(null);
		let raf = 0;
		const poll = () => {
			const loaded = assetManager.getFontFamilies(url, size);
			if (loaded) {
				setFamilies(loaded);
			} else {
				raf = requestAnimationFrame(poll);
			}
		};
		poll();
		return () => cancelAnimationFrame(raf);
	}, [assetManager, url, size]);
	return families;
};

const BlittedLine = ({
	font,
	text,
	style,
	zoom,
}: Readonly<{
	font: LoadedFont;
	text: string;
	style: FontStyle;
	zoom: number;
}>) => {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) {
			return;
		}
		const image = blitText(font, text, style);
		const source = document.createElement("canvas");
		source.width = image.width;
		source.height = image.height;
		source.getContext("2d")!.putImageData(image, 0, 0);
		canvas.width = image.width * zoom;
		canvas.height = image.height * zoom;
		const ctx = canvas.getContext("2d")!;
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
	}, [font, text, style, zoom]);
	return <canvas ref={ref} className={styles.line} />;
};

const GlyphCell = ({
	font,
	char,
	style,
	zoom,
}: Readonly<{
	font: LoadedFont;
	char: string;
	style: FontStyle;
	zoom: number;
}>) => {
	const supported = supportsChar(font, char, style);
	return (
		<div
			className={classNames(
				styles.cell,
				!supported && styles.cellMissing,
			)}
			title={supported ? undefined : "Not supported by this font"}
		>
			<div className={styles.cellGlyph}>
				<BlittedLine
					font={font}
					text={char}
					style={style}
					zoom={zoom}
				/>
			</div>
			<span className={styles.cellLabel}>{char}</span>
		</div>
	);
};

const FontPreview = ({
	assetUrl,
	assetManager,
}: Readonly<{
	assetUrl: string;
	assetManager: AssetManager;
}>) => {
	const [size, setSize] = useState(DEFAULT_SIZE);
	const [sizeText, setSizeText] = useState(String(DEFAULT_SIZE));
	const [zoom, setZoom] = useState(DEFAULT_ZOOM);
	const [custom, setCustom] = useState("Type your own text here");
	const [familyIndex, setFamilyIndex] = useState(0);
	const [style, setStyle] = useState<FontStyle>(STYLE_REGULAR);
	const families = useFamilies(assetManager, assetUrl, size);

	useEffect(() => {
		setFamilyIndex(0);
	}, [assetUrl]);

	useEffect(() => {
		const next = Number(sizeText);
		if (!Number.isFinite(next)) {
			return;
		}
		const id = window.setTimeout(() => {
			setSize(clamp(Math.round(next), MIN_SIZE, MAX_SIZE));
		}, SIZE_DEBOUNCE_MS);
		return () => window.clearTimeout(id);
	}, [sizeText]);

	const commitSize = () => {
		const next = Number(sizeText);
		if (Number.isFinite(next)) {
			const clamped = clamp(Math.round(next), MIN_SIZE, MAX_SIZE);
			setSize(clamped);
			setSizeText(String(clamped));
		} else {
			setSizeText(String(size));
		}
	};

	const font = families
		? families[clamp(familyIndex, 0, families.length - 1)]!
		: null;
	const customLines = custom.split("\n");

	return (
		<div className={styles.fontPreview}>
			<TooltipProvider>
				<div className={styles.topBar}>
					<span className={controls.docName}>
						{font?.name ?? assetFilename(assetUrl)}
					</span>
					<span className={controls.spacer} />
					{families && families.length > 1 && (
						<ToggleGroup
							value={[String(familyIndex)]}
							onValueChange={(value) => {
								if (value.length > 0) {
									setFamilyIndex(Number(value[0]));
								}
							}}
							className={controls.toggleGroup}
						>
							{families.map((family, i) => (
								<Toggle
									key={family.name}
									value={String(i)}
									className={controls.textToggle}
								>
									{family.name}
								</Toggle>
							))}
						</ToggleGroup>
					)}
					<ToggleGroup
						value={[String(style)]}
						onValueChange={(value) => {
							if (value.length > 0) {
								setStyle(Number(value[0]) as FontStyle);
							}
						}}
						className={controls.toggleGroup}
					>
						{STYLE_OPTIONS.map((option) => {
							const isSynth =
								font?.faces[option.id].synthetic != null;
							return (
								<Tooltip
									key={option.id}
									label={isSynth ? "Synthesized" : "Native"}
								>
									<Toggle
										value={String(option.id)}
										className={controls.textToggle}
									>
										{option.label}
										{font && (
											<span
												className={classNames(
													styles.dot,
													isSynth
														? styles.dotSynth
														: styles.dotNative,
												)}
											/>
										)}
									</Toggle>
								</Tooltip>
							);
						})}
					</ToggleGroup>
					<label className={styles.control}>
						Size
						<input
							type="number"
							className={styles.sizeInput}
							value={sizeText}
							min={MIN_SIZE}
							max={MAX_SIZE}
							onChange={(e) => setSizeText(e.target.value)}
							onBlur={commitSize}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.currentTarget.blur();
								}
							}}
						/>
					</label>
					<div className={styles.control}>
						Zoom
						<Tooltip label="Zoom out">
							<Button
								variant="icon"
								disabled={zoom <= MIN_ZOOM}
								onClick={() =>
									setZoom((z) => clamp(z - 1, MIN_ZOOM, MAX_ZOOM))
								}
							>
								<MagnifyingGlassMinusIcon />
							</Button>
						</Tooltip>
						<span className={styles.zoomValue}>{zoom}×</span>
						<Tooltip label="Zoom in">
							<Button
								variant="icon"
								disabled={zoom >= MAX_ZOOM}
								onClick={() =>
									setZoom((z) => clamp(z + 1, MIN_ZOOM, MAX_ZOOM))
								}
							>
								<MagnifyingGlassPlusIcon />
							</Button>
						</Tooltip>
					</div>
				</div>
				{font ? (
					<div className={styles.body}>
						<div className={styles.cells}>
							{LETTER_PAIRS.map(([upper, lower]) => (
								<div key={upper} className={styles.pair}>
									<GlyphCell
										font={font}
										char={upper}
										style={style}
										zoom={zoom}
									/>
									<GlyphCell
										font={font}
										char={lower}
										style={style}
										zoom={zoom}
									/>
								</div>
							))}
						</div>
						{SYMBOL_GROUPS.map((group) => (
							<div key={group.join("")} className={styles.cells}>
								{group.map((char) => (
									<GlyphCell
										key={char}
										font={font}
										char={char}
										style={style}
										zoom={zoom}
									/>
								))}
							</div>
						))}
						<div className={styles.lines}>
							{PANGRAMS.map((sentence) => (
								<div key={sentence} className={styles.lineRow}>
									<BlittedLine
										font={font}
										text={sentence}
										style={style}
										zoom={zoom}
									/>
								</div>
							))}
						</div>
						<div className={styles.lines}>
							<textarea
								className={styles.customInput}
								value={custom}
								rows={2}
								onChange={(e) => setCustom(e.target.value)}
							/>
							{customLines.map((line, i) => (
								<div key={i} className={styles.lineRow}>
									{line.length > 0 ? (
										<BlittedLine
											font={font}
											text={line}
											style={style}
											zoom={zoom}
										/>
									) : (
										<div className={styles.blankLine} />
									)}
								</div>
							))}
						</div>
					</div>
				) : (
					<div className={controls.loading}>Loading…</div>
				)}
			</TooltipProvider>
		</div>
	);
};

export default FontPreview;
