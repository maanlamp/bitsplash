import { useState } from "react";
import type { SaveMetadata } from "../../engine/save/save-driver";
import { Text, View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import {
	HINT,
	MenuButton,
	OVERLAY,
	PANEL,
	TITLE,
} from "./menu-widgets";

const kindLabel = (meta: SaveMetadata): string => {
	if (meta.kind === "manual") {
		return meta.label || "Manual save";
	}
	return meta.kind === "quick" ? "Quicksave" : "Autosave";
};

const formatTime = (savedAt: number): string =>
	new Date(savedAt).toLocaleString();

const row: Style = {
	flexDirection: "row",
	gap: 6,
	alignItems: "stretch",
	minWidth: 240,
};

const entry: Style = {
	flexGrow: 1,
	flexDirection: "column",
	gap: 2,
	padding: 8,
	backgroundColor: [0.18, 0.18, 0.22, 1],
};

const entryFocused: Style = {
	...entry,
	backgroundColor: [0.42, 0.34, 0.11, 1],
};

const del: Style = {
	padding: 8,
	alignItems: "center",
	justifyContent: "center",
	backgroundColor: [0.28, 0.12, 0.12, 1],
};

const delFocused: Style = {
	...del,
	backgroundColor: [0.55, 0.18, 0.18, 1],
};

type SaveRowProps = Readonly<{
	meta: SaveMetadata;
	onLoad: (slot: string) => void;
	onDelete: (slot: string) => void;
}>;

const SaveRow = ({ meta, onLoad, onDelete }: SaveRowProps) => {
	const [entryFocus, setEntryFocus] = useState(false);
	const [delFocus, setDelFocus] = useState(false);
	return (
		<View style={row}>
			<View
				focusable
				focusGroup="saves"
				style={entryFocus ? entryFocused : entry}
				onFocus={() => setEntryFocus(true)}
				onBlur={() => setEntryFocus(false)}
				onClick={() => onLoad(meta.slot)}
				onConfirm={() => onLoad(meta.slot)}
			>
				<Text style={{ color: [1, 1, 1, 1] }}>{kindLabel(meta)}</Text>
				<Text style={{ color: [0.6, 0.6, 0.68, 1] }}>
					{formatTime(meta.savedAt)}
				</Text>
			</View>
			<View
				focusable
				focusGroup="saves"
				style={delFocus ? delFocused : del}
				onFocus={() => setDelFocus(true)}
				onBlur={() => setDelFocus(false)}
				onClick={() => onDelete(meta.slot)}
				onConfirm={() => onDelete(meta.slot)}
			>
				<Text style={{ color: [1, 0.85, 0.85, 1] }}>Delete</Text>
			</View>
		</View>
	);
};

export type SaveListProps = Readonly<{
	title: string;
	saves: ReadonlyArray<SaveMetadata>;
	onLoad: (slot: string) => void;
	onDelete: (slot: string) => void;
	onBack: () => void;
}>;

export const SaveList = ({
	title,
	saves,
	onLoad,
	onDelete,
	onBack,
}: SaveListProps) => (
	<View style={OVERLAY}>
		<View style={PANEL} onCancel={() => onBack()}>
			<Text style={TITLE}>{title}</Text>
			{saves.length === 0 ? (
				<Text style={HINT}>No saves yet.</Text>
			) : (
				saves.map((meta) => (
					<SaveRow
						key={meta.slot}
						meta={meta}
						onLoad={onLoad}
						onDelete={onDelete}
					/>
				))
			)}
			<MenuButton
				label="Back"
				focusGroup="saves"
				onActivate={onBack}
			/>
		</View>
	</View>
);
