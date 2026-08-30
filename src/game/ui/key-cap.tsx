import type { ColorInput } from "../../engine/render/color-resolver";
import type { NineSliceInsets } from "../../engine/render/nine-slice";
import type { TileSource } from "../../engine/render/renderer-2d";
import type { FontSettings } from "../../engine/text/font-settings";
import {
	HoldRing,
	Image,
	Text,
	View,
} from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import type { ResolvedInputIcon } from "./input-icon-atlas";

export type ActivationMarker =
	| "press"
	| "hold"
	| "toggle"
	| "doubleTap";

export const KEYCAP_MIN = 13;

const MARKER_SIZE = 8;

const RING_INNER: ColorInput = [0.32, 0.32, 0.32, 1];
const RING_FILL: ColorInput = [1, 0.85, 0.4, 1];
const RING_OUTER: ColorInput = [0, 0, 0, 1];

const WRAP: Style = {
	flexDirection: "column",
	alignItems: "center",
	alignSelf: "center",
};

const ICON_SIZE = 16;

const CAP: Style = {
	position: "relative",
	minWidth: KEYCAP_MIN,
	minHeight: KEYCAP_MIN,
	padding: 2,
	alignItems: "center",
	justifyContent: "center",
};

const ICON_STYLE: Style = {
	width: ICON_SIZE,
	height: ICON_SIZE,
};

const CAP_FLAT_BACKGROUND: ColorInput = [0, 0, 0, 0.7];

const GLYPH_OUTLINE: ColorInput = [0, 0, 0, 1];

const MARKER: Style = {
	width: MARKER_SIZE,
	height: MARKER_SIZE,
	marginBottom: 1,
};

const RING_STYLE: Style = {
	position: "absolute",
	left: 0,
	top: 0,
	right: 0,
	bottom: 0,
};

export const holdRingNodeId = (id: string): string => `${id}-ring`;

export type KeyCapProps = Readonly<{
	glyph: string;
	font?: FontSettings;
	activation?: ActivationMarker;
	marker?: TileSource | null;
	frame?: TileSource | null;
	insets?: NineSliceInsets;
	icon?: ResolvedInputIcon | null;
	id?: string;
}>;

export const KeyCap = ({
	glyph,
	font,
	activation,
	marker,
	frame,
	insets,
	icon,
	id,
}: KeyCapProps) => {
	const showHold =
		activation === "hold" &&
		id !== undefined &&
		Boolean(frame) &&
		Boolean(insets);
	const showMarker = Boolean(marker) && activation !== "hold";
	const showIcon = Boolean(icon);
	const capStyle: Style = showIcon
		? { ...CAP }
		: frame && insets
			? { ...CAP, nineSlice: { image: frame, insets } }
			: { ...CAP, backgroundColor: CAP_FLAT_BACKGROUND };
	const glyphStyle: Style = {
		color: [1, 1, 1, 1],
		font,
		centerInk: true,
		...(frame ? null : { textOutline: GLYPH_OUTLINE }),
	};
	const cap = (
		<View id={id} style={capStyle}>
			{showHold && insets ? (
				<HoldRing
					id={holdRingNodeId(id)}
					style={RING_STYLE}
					frame={frame as TileSource}
					insets={insets}
					inner={RING_INNER}
					fill={RING_FILL}
					outer={RING_OUTER}
				/>
			) : null}
			{showIcon ? (
				<Image
					src={icon!.image}
					style={ICON_STYLE}
					srcX={icon!.srcX}
					srcY={icon!.srcY}
					srcW={icon!.srcW}
					srcH={icon!.srcH}
				/>
			) : (
				<Text style={glyphStyle}>{glyph}</Text>
			)}
		</View>
	);
	if (!showMarker) {
		return cap;
	}
	return (
		<View style={WRAP}>
			<Image src={marker as TileSource} style={MARKER} />
			{cap}
		</View>
	);
};
