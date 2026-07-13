import { Text, View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import type { ToastState } from "./game-ui-state";

const anchor: Style = {
	position: "absolute",
	top: 8,
	right: 8,
	flexDirection: "column",
	alignItems: "flex-end",
};

export type ToastProps = Readonly<{ toast: ToastState }>;

export const Toast = ({ toast }: ToastProps) => (
	<View style={anchor}>
		<View
			style={{
				padding: 6,
				backgroundColor: [0.09, 0.09, 0.12, 1],
				alpha: toast.alpha,
			}}
		>
			<Text style={{ color: [0.9, 0.92, 1, 1], alpha: toast.alpha }}>
				{toast.text}
			</Text>
		</View>
	</View>
);
