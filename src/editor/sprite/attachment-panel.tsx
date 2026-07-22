import { PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { useState, useSyncExternalStore } from "react";
import Button from "../button";
import Tooltip from "../tooltip";
import {
	clearAttachmentPoint,
	createAttachmentName,
	deleteAttachmentName,
	renameAttachmentName,
} from "./attachment-commands";
import type { History } from "../history";
import styles from "./attachment-panel.module.scss";
import type { SpriteDocument } from "./sprite-document";
import type { SpriteEditorState } from "./sprite-editor-state";

/** Pick a default point name not already taken (`point`, `point 2`, …). */
const nextDefaultName = (existing: readonly string[]): string => {
	const taken = new Set(existing);
	if (!taken.has("point")) {
		return "point";
	}
	for (let n = 2; ; n++) {
		const candidate = `point ${n}`;
		if (!taken.has(candidate)) {
			return candidate;
		}
	}
};

const AttachmentRow = ({
	doc,
	history,
	state,
	name,
	active,
	hasPoint,
	existing,
}: Readonly<{
	doc: SpriteDocument;
	history: History;
	state: SpriteEditorState;
	name: string;
	active: boolean;
	hasPoint: boolean;
	existing: readonly string[];
}>) => {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(name);

	const commit = () => {
		setEditing(false);
		const trimmed = draft.trim();
		if (trimmed && trimmed !== name && !existing.includes(trimmed)) {
			renameAttachmentName(doc, history, name, trimmed);
			if (active) {
				state.setActiveAttachment(trimmed);
			}
		}
	};

	return (
		<li
			className={clsx(styles.row, active && styles.rowActive)}
			onPointerDown={() => state.setActiveAttachment(name)}
		>
			<span
				className={clsx(styles.dot, hasPoint && styles.dotOn)}
				aria-hidden
			/>
			{editing ? (
				<input
					className={styles.nameInput}
					value={draft}
					autoFocus
					onChange={(e) => setDraft(e.target.value)}
					onBlur={commit}
					onPointerDown={(e) => e.stopPropagation()}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							commit();
						} else if (e.key === "Escape") {
							setDraft(name);
							setEditing(false);
						}
					}}
				/>
			) : (
				<span
					className={styles.name}
					onDoubleClick={() => {
						setDraft(name);
						setEditing(true);
					}}
				>
					{name}
				</span>
			)}
			<Tooltip label="Delete point">
				<Button
					variant="icon"
					className={styles.rowButton}
					onClick={(e) => {
						e.stopPropagation();
						deleteAttachmentName(doc, history, name);
						if (active) {
							state.setActiveAttachment(null);
						}
					}}
					aria-label="Delete point"
				>
					<TrashIcon />
				</Button>
			</Tooltip>
		</li>
	);
};

/**
 * Manages named attachment points: add, rename (double-click), select the active
 * name (the one the attachment tool edits), and delete. Each row shows a dot that
 * fills when the current frame has a point for that name. Placement/movement of
 * the point itself happens on the canvas with the attachment tool.
 *
 * Docked as a floating panel in the sprite body (top-left, mirroring the preview
 * panel top-right) — a conventional minimal placement flagged for user feedback.
 */
const AttachmentPanel = ({
	doc,
	history,
	state,
}: Readonly<{
	doc: SpriteDocument;
	history: History;
	state: SpriteEditorState;
}>) => {
	useSyncExternalStore(doc.subscribe, () => doc.version);
	const active = useSyncExternalStore(
		state.subscribe,
		() => state.activeAttachment,
	);

	const names = doc.attachmentNames();
	const frame = doc.activeFrameIndex;

	const addPoint = () => {
		const name = nextDefaultName(names);
		createAttachmentName(doc, history, name);
		state.setActiveAttachment(name);
	};

	return (
		<div className={styles.panel}>
			<div className={styles.header}>
				<span className={styles.heading}>Attachments</span>
				<Tooltip label="Add point">
					<Button
						variant="icon"
						onClick={addPoint}
						aria-label="Add point"
					>
						<PlusIcon weight="bold" />
					</Button>
				</Tooltip>
			</div>
			{names.length === 0 ? (
				<p className={styles.empty}>
					Add a point, then place it on the canvas with the attachment
					tool.
				</p>
			) : (
				<ul className={styles.list}>
					{names.map((name) => (
						<AttachmentRow
							key={name}
							doc={doc}
							history={history}
							state={state}
							name={name}
							active={name === active}
							hasPoint={
								doc.attachmentPoint(name, frame) !== undefined
							}
							existing={names}
						/>
					))}
				</ul>
			)}
			{active !== null && (
				<div className={styles.frameRow}>
					<span className={styles.frameLabel}>
						Frame {frame + 1}:{" "}
						{describePoint(doc.attachmentPoint(active, frame))}
					</span>
					{doc.attachmentPoint(active, frame) !== undefined && (
						<Tooltip label="Clear on this frame">
							<Button
								variant="icon"
								className={styles.rowButton}
								onClick={() =>
									clearAttachmentPoint(doc, history, active, frame)
								}
								aria-label="Clear on this frame"
							>
								<XIcon />
							</Button>
						</Tooltip>
					)}
				</div>
			)}
		</div>
	);
};

const describePoint = (
	point: Readonly<{ x: number; y: number }> | undefined,
): string =>
	point
		? `${round(point.x)}, ${round(point.y)}`
		: "no point (click canvas)";

const round = (n: number): number => Math.round(n * 10) / 10;

export default AttachmentPanel;
