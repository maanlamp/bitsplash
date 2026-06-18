import { ContextMenu } from "@base-ui/react/context-menu";
import {
	ArrowSquareOutIcon,
	ArrowUpIcon,
	CaretLeftIcon,
	CaretRightIcon,
	CubeIcon,
	FileAudioIcon,
	FileIcon,
	FileImageIcon,
	FolderIcon,
	FolderPlusIcon,
	type Icon,
	PencilSimpleIcon,
	SquaresFourIcon,
	TextAaIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import classNames from "classnames";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { DirEntry } from "../../project-rpc";
import type { AssetCreateActions } from "../asset-context-menu";
import { writeDragPayload } from "../asset-drop-registry";
import { type AssetType, classifyAsset } from "../assets";
import type { History } from "../history";
import { fsProtocolUrl, listDir } from "../project-io";
import surface from "../styles/surface.module.scss";
import styles from "./asset-browser.module.scss";
import {
	createFolder,
	deleteAsset,
	dirName,
	renameAsset,
	uniqueName,
} from "./asset-fs";

const TYPE_ICONS: Record<AssetType, Icon> = {
	sprite: FileImageIcon,
	tileset: SquaresFourIcon,
	audio: FileAudioIcon,
	font: TextAaIcon,
	prefab: CubeIcon,
	unknown: FileIcon,
};

const isImage = (type: AssetType): boolean =>
	type === "sprite" || type === "tileset";

const segments = (
	path: string,
	root: string,
): ReadonlyArray<{ label: string; path: string }> => {
	const sep = path.includes("\\") ? "\\" : "/";
	const absolute = /^[\\/]/.test(path);
	const parts = path.split(/[\\/]/).filter(Boolean);
	const out: { label: string; path: string }[] = [];
	let acc = "";
	parts.forEach((part, index) => {
		acc =
			index === 0
				? absolute
					? `${sep}${part}`
					: part
				: `${acc}${sep}${part}`;
		out.push({ label: part, path: acc });
	});
	return out.length ? out : [{ label: root, path: root }];
};

export const AssetBrowser = ({
	root,
	history,
	assetActions,
	onOpenFile,
}: Readonly<{
	root: string;
	history: History;
	assetActions: AssetCreateActions;
	onOpenFile: (entry: DirEntry) => void;
}>) => {
	const [path, setPath] = useState(root);
	const [back, setBack] = useState<ReadonlyArray<string>>([]);
	const [forward, setForward] = useState<ReadonlyArray<string>>([]);
	const [entries, setEntries] = useState<ReadonlyArray<DirEntry>>([]);
	const [editing, setEditing] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);
	const [contextTarget, setContextTarget] = useState<DirEntry | null>(
		null,
	);

	const pathRef = useRef(path);
	useEffect(() => {
		pathRef.current = path;
	}, [path]);

	const load = (target: string): void => {
		void listDir(target).then((result) => {
			if (pathRef.current === target) {
				setEntries(result.entries);
			}
		});
	};

	useEffect(() => {
		void listDir(path).then((result) => {
			if (pathRef.current === path) {
				setEntries(result.entries);
			}
		});
	}, [path]);

	const refresh = (): void => load(pathRef.current);

	const navigate = (next: string): void => {
		setBack((b) => [...b, path]);
		setForward([]);
		setPath(next);
	};

	const goBack = (): void => {
		if (!back.length) {
			return;
		}
		setForward((f) => [path, ...f]);
		setPath(back[back.length - 1]!);
		setBack((b) => b.slice(0, -1));
	};

	const goForward = (): void => {
		if (!forward.length) {
			return;
		}
		setBack((b) => [...b, path]);
		setPath(forward[0]!);
		setForward((f) => f.slice(1));
	};

	const goUp = (): void => {
		const up = dirName(path);
		if (up && up !== path) {
			navigate(up);
		}
	};

	const open = (entry: DirEntry): void => {
		if (entry.isDirectory) {
			navigate(entry.path);
		} else {
			onOpenFile(entry);
		}
	};

	const names = new Set(entries.map((e) => e.name));

	const commitRename = (entry: DirEntry, value: string): void => {
		setEditing(null);
		const trimmed = value.trim();
		if (!trimmed || trimmed === entry.name) {
			return;
		}
		void renameAsset(history, entry.path, trimmed, refresh);
	};

	const commitFolder = (value: string): void => {
		setCreating(false);
		const trimmed = value.trim() || "untitled";
		void createFolder(
			history,
			path,
			uniqueName(trimmed, names),
			refresh,
		);
	};

	const createMenu = (
		<>
			<ContextMenu.Item
				className={surface.item}
				onClick={assetActions.onNewSprite}
			>
				<FileImageIcon className={surface.itemIcon} weight="bold" />
				New sprite
			</ContextMenu.Item>
			<ContextMenu.Item
				className={surface.item}
				onClick={assetActions.onNewTileset}
			>
				<SquaresFourIcon className={surface.itemIcon} weight="bold" />
				New tileset
			</ContextMenu.Item>
			<ContextMenu.Item
				className={surface.item}
				onClick={assetActions.onNewAudio}
			>
				<FileAudioIcon className={surface.itemIcon} weight="bold" />
				New audio
			</ContextMenu.Item>
			<ContextMenu.Item
				className={surface.item}
				onClick={() => setCreating(true)}
			>
				<FolderPlusIcon className={surface.itemIcon} weight="bold" />
				New folder
			</ContextMenu.Item>
		</>
	);

	return (
		<div className={styles.browser}>
			<div className={styles.locationBar}>
				<button
					type="button"
					className={styles.navButton}
					disabled={!back.length}
					onClick={goBack}
					aria-label="Back"
				>
					<CaretLeftIcon />
				</button>
				<button
					type="button"
					className={styles.navButton}
					disabled={!forward.length}
					onClick={goForward}
					aria-label="Forward"
				>
					<CaretRightIcon />
				</button>
				<button
					type="button"
					className={styles.navButton}
					onClick={goUp}
					aria-label="Up"
				>
					<ArrowUpIcon />
				</button>
				<div className={styles.breadcrumbs}>
					{segments(path, root).map((segment, index) => (
						<button
							type="button"
							key={segment.path}
							className={styles.crumb}
							onClick={() => navigate(segment.path)}
						>
							{index > 0 && (
								<span className={styles.crumbSep}>/</span>
							)}
							{segment.label}
						</button>
					))}
				</div>
			</div>
			<ContextMenu.Root>
				<ContextMenu.Trigger
					className={styles.gridWrap}
					onContextMenuCapture={() => setContextTarget(null)}
				>
					<div className={styles.grid}>
						{creating && (
							<div
								className={classNames(styles.cell, styles.editing)}
							>
								<div className={styles.thumb}>
									<FolderIcon className={styles.icon} />
								</div>
								<NameInput
									initial="untitled"
									onCommit={commitFolder}
									onCancel={() => setCreating(false)}
								/>
							</div>
						)}
						{entries.map((entry) => {
							const type = entry.isDirectory
								? null
								: classifyAsset(entry.name);
							const TypeIcon = entry.isDirectory
								? FolderIcon
								: TYPE_ICONS[type!];
							return (
								<div
									key={entry.path}
									className={styles.cell}
									draggable={!entry.isDirectory}
									onDragStart={(event) => {
										if (entry.isDirectory) {
											return;
										}
										writeDragPayload(event.dataTransfer, {
											type: "asset-drag",
											path: entry.path,
											assetType: classifyAsset(entry.name),
										});
									}}
									onDoubleClick={() => open(entry)}
									onContextMenu={() => setContextTarget(entry)}
								>
									<div className={styles.thumb}>
										{type && isImage(type) ? (
											<img
												className={styles.thumbImage}
												src={fsProtocolUrl(entry.path)}
												alt={entry.name}
												loading="lazy"
											/>
										) : (
											<TypeIcon className={styles.icon} />
										)}
									</div>
									{editing === entry.path ? (
										<NameInput
											initial={entry.name}
											onCommit={(value) => commitRename(entry, value)}
											onCancel={() => setEditing(null)}
										/>
									) : (
										<span className={styles.label}>{entry.name}</span>
									)}
								</div>
							);
						})}
					</div>
				</ContextMenu.Trigger>
				<ContextMenu.Portal>
					<ContextMenu.Positioner>
						<ContextMenu.Popup
							className={classNames(surface.surface, surface.menu)}
						>
							{contextTarget ? (
								<EntryMenu
									onOpen={() => open(contextTarget)}
									onRename={() => setEditing(contextTarget.path)}
									onDelete={() =>
										void deleteAsset(
											history,
											contextTarget.path,
											refresh,
										)
									}
									createMenu={
										contextTarget.isDirectory ? createMenu : null
									}
								/>
							) : (
								createMenu
							)}
						</ContextMenu.Popup>
					</ContextMenu.Positioner>
				</ContextMenu.Portal>
			</ContextMenu.Root>
		</div>
	);
};

const EntryMenu = ({
	onOpen,
	onRename,
	onDelete,
	createMenu,
}: Readonly<{
	onOpen: () => void;
	onRename: () => void;
	onDelete: () => void;
	createMenu: ReactNode;
}>) => (
	<>
		<ContextMenu.Item className={surface.item} onClick={onOpen}>
			<ArrowSquareOutIcon
				className={surface.itemIcon}
				weight="bold"
			/>
			Open
		</ContextMenu.Item>
		<ContextMenu.Item className={surface.item} onClick={onRename}>
			<PencilSimpleIcon className={surface.itemIcon} weight="bold" />
			Rename
		</ContextMenu.Item>
		<ContextMenu.Item className={surface.item} onClick={onDelete}>
			<TrashIcon className={surface.itemIcon} weight="bold" />
			Delete
		</ContextMenu.Item>
		{createMenu && (
			<>
				<ContextMenu.Separator className={surface.divider} />
				{createMenu}
			</>
		)}
	</>
);

const NameInput = ({
	initial,
	onCommit,
	onCancel,
}: Readonly<{
	initial: string;
	onCommit: (value: string) => void;
	onCancel: () => void;
}>) => (
	<input
		className={styles.nameInput}
		defaultValue={initial}
		ref={(node) => {
			if (node) {
				node.focus();
				node.select();
			}
		}}
		onKeyDown={(event) => {
			if (event.key === "Enter") {
				onCommit(event.currentTarget.value);
			} else if (event.key === "Escape") {
				onCancel();
			}
		}}
		onBlur={(event) => onCommit(event.currentTarget.value)}
	/>
);
