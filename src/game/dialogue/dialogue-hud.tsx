import { useSyncExternalStore } from "react";
import { Overlay } from "../../engine/ui/components/overlay";
import {
	GlyphText,
	Text,
	View,
} from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import type { FontSettings } from "../../engine/text/font-settings";
import { KeyCap } from "../ui/key-cap";
import { DIALOGUE_UI } from "./dialogue-ui";
import type { DialogueHudState } from "./dialogue-hud-state";

export const DIALOGUE_BOX_ID = "dialogue-box";
export const DIALOGUE_GLYPHS_ID = "dialogue-glyphs";

const ACCENT: [number, number, number, number] = [
	0.478, 0.329, 0.063, 1,
];
const TEXT: [number, number, number, number] = [0, 0, 0, 1];

export type DialogueHudProps = Readonly<{
	store: DialogueHudState;
}>;

type ChoiceRowProps = Readonly<{
	index: number;
	text: string;
	selected: boolean;
	font: FontSettings | undefined;
	store: DialogueHudState;
}>;

const ChoiceRow = ({
	index,
	text,
	selected,
	font,
	store,
}: ChoiceRowProps) => (
	<View
		focusable
		focusGroup="dialogue-choices"
		style={{ flexDirection: "row" }}
		onFocus={() => store.select(index)}
		onClick={() => store.confirm(index)}
		onConfirm={() => store.confirm(index)}
	>
		<Text style={{ font, color: selected ? ACCENT : TEXT }}>
			{`${selected ? "> " : "  "}${text}`}
		</Text>
	</View>
);

export const DialogueHud = ({ store }: DialogueHudProps) => {
	const snap = useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
	);
	if (!snap.open) {
		return null;
	}
	const bodyFont = snap.bodyFont ?? undefined;
	const uiFont = snap.uiFont ?? undefined;
	const panelStyle: Style = {
		width: DIALOGUE_UI.panelWidth,
		padding: DIALOGUE_UI.padding,
		flexDirection: "column",
		...(snap.panel
			? { nineSlice: { image: snap.panel, insets: snap.insets } }
			: null),
	};
	return (
		<Overlay
			style={{
				flexDirection: "column",
				justifyContent: "flex-end",
				alignItems: "center",
				paddingBottom: DIALOGUE_UI.marginBottom,
			}}
		>
			<View
				id={DIALOGUE_BOX_ID}
				style={{
					width: DIALOGUE_UI.panelWidth,
					flexDirection: "column",
					alignItems: "flex-start",
				}}
			>
				{snap.speaker.length > 0 && (
					<Text style={{ color: ACCENT, font: uiFont }}>
						{snap.speaker}
					</Text>
				)}
				<View style={panelStyle}>
					<GlyphText
						id={DIALOGUE_GLYPHS_ID}
						glyphs={snap.glyphs}
						style={{ font: bodyFont }}
					/>
					{snap.more && (
						<View
							style={{
								flexDirection: "row",
								justifyContent: "flex-end",
								marginTop: DIALOGUE_UI.optionGap,
							}}
						>
							<KeyCap
								glyph={snap.advanceGlyph}
								font={uiFont}
								frame={snap.kbdFrame}
								insets={snap.kbdInsets}
								icon={snap.advanceIcon}
								activation={snap.advanceActivation}
							/>
						</View>
					)}
					{snap.choices.length > 0 && (
						<View
							style={{
								flexDirection: "column",
								marginTop: DIALOGUE_UI.optionGap,
							}}
						>
							{snap.choices.map((choice, index) => (
								<ChoiceRow
									key={index}
									index={index}
									text={choice}
									selected={index === snap.selectedOption}
									font={uiFont}
									store={store}
								/>
							))}
						</View>
					)}
				</View>
			</View>
		</Overlay>
	);
};
