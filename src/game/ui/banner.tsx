import type { ColorInput } from "../../engine/render/color-resolver";
import type { FontSettings } from "../../engine/text/font-settings";
import { Overlay } from "../../engine/ui/components/overlay";
import { Text, View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";

const BAR: Style = {
	backgroundColor: [0, 0, 0, 1],
	paddingTop: 8,
	paddingBottom: 8,
	alignItems: "center",
	justifyContent: "center",
};

export type BannerPlace = "center" | "third";

export type BannerProps = Readonly<{
	id: string;
	text: string;
	color: ColorInput;
	font: FontSettings;
	place: BannerPlace;
}>;

export const Banner = ({
	id,
	text,
	color,
	font,
	place,
}: BannerProps) => {
	const bar = (
		<View style={BAR}>
			<Text style={{ color, font }}>{text}</Text>
		</View>
	);
	if (place === "third") {
		return (
			<Overlay
				id={id}
				alpha={0}
				style={{ flexDirection: "column", pointerEvents: "none" }}
			>
				<View style={{ flexGrow: 1 }} />
				{bar}
				<View style={{ flexGrow: 2 }} />
			</Overlay>
		);
	}
	return (
		<Overlay
			id={id}
			alpha={0}
			style={{
				flexDirection: "column",
				justifyContent: "center",
				pointerEvents: "none",
			}}
		>
			{bar}
		</Overlay>
	);
};
