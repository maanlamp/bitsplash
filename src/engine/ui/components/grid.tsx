import { Children, type ReactNode } from "react";
import { View } from "../reconciler/ui-elements";
import type { Style } from "../style/style";

export interface GridProps {
	columns: number;
	cellSize: number;
	gap?: number;
	style?: Style;
	children?: ReactNode;
}

export const Grid = ({
	columns,
	cellSize,
	gap = 0,
	style,
	children,
}: GridProps) => {
	const items = Children.toArray(children);
	const rows: ReactNode[][] = [];
	for (let i = 0; i < items.length; i += columns) {
		rows.push(items.slice(i, i + columns));
	}
	return (
		<View style={{ flexDirection: "column", gap, ...style }}>
			{rows.map((row, r) => (
				<View key={r} style={{ flexDirection: "row", gap }}>
					{row.map((cell, c) => (
						<View
							key={r * columns + c}
							style={{ width: cellSize, height: cellSize }}
						>
							{cell}
						</View>
					))}
				</View>
			))}
		</View>
	);
};
