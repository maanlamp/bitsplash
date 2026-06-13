import { XIcon } from "@phosphor-icons/react";
import classNames from "classnames";
import { motion, type PanInfo } from "motion/react";
import { type ReactNode, useRef, useState } from "react";
import Tooltip from "../tooltip";
import {
	contains,
	dockZone,
	type Rect,
	toRect,
	zoneRect,
} from "./dock-zones";
import {
	type DockZone,
	moveView,
	setActive,
	setTabsViews,
	type TabsNode,
	type ViewId,
	type Workspace as WorkspaceState,
} from "./layout";
import { isClosable, viewIcon, viewTitle } from "./view-registry";
import styles from "./workspace.module.scss";

type LeafInfo = Readonly<{
	anchor: ViewId;
	rect: Rect;
	stripRect: Rect;
	contentRect: Rect;
	tabs: ReadonlyArray<{ id: ViewId; rect: Rect }>;
}>;

type DropTarget =
	| Readonly<{
			mode: "reorder";
			anchor: ViewId;
			order: ReadonlyArray<ViewId>;
	  }>
	| Readonly<{
			mode: "dock";
			anchor: ViewId;
			zone: DockZone;
			rect: Rect;
	  }>;

export type TabApi = Readonly<{
	activate: (id: ViewId) => void;
	close: (id: ViewId) => void;
	dragging: ViewId | null;
	focused: ViewId | null;
	isDirty: (id: ViewId) => boolean;
	dragProps: (id: ViewId) => Record<string, unknown>;
}>;

const collectLeaves = (): ReadonlyArray<LeafInfo> =>
	[...document.querySelectorAll<HTMLElement>("[data-leaf]")].map(
		(el) => {
			const rect = toRect(el.getBoundingClientRect());
			const stripEl = el.querySelector<HTMLElement>("[data-strip]");
			const stripRect = stripEl
				? toRect(stripEl.getBoundingClientRect())
				: {
						left: rect.left,
						top: rect.top,
						width: rect.width,
						height: 0,
					};
			const tabs = stripEl
				? [
						...stripEl.querySelectorAll<HTMLElement>("[data-tab]"),
					].map((tab) => ({
						id: tab.dataset.tab ?? "",
						rect: toRect(tab.getBoundingClientRect()),
					}))
				: [];
			return {
				anchor: el.dataset.leaf ?? "",
				rect,
				stripRect,
				contentRect: {
					left: rect.left,
					top: stripRect.top + stripRect.height,
					width: rect.width,
					height: rect.height - stripRect.height,
				},
				tabs,
			};
		},
	);

const anchorFor = (leaf: LeafInfo, dragged: ViewId): ViewId =>
	leaf.tabs.find((tab) => tab.id !== dragged)?.id ?? leaf.anchor;

const resolveTarget = (
	leaves: ReadonlyArray<LeafInfo>,
	dragged: ViewId,
	x: number,
	y: number,
): DropTarget | null => {
	const leaf = leaves.find((candidate) =>
		contains(candidate.rect, x, y),
	);
	if (!leaf) {
		return null;
	}
	const isOrigin = leaf.tabs.some((tab) => tab.id === dragged);
	if (contains(leaf.stripRect, x, y)) {
		if (isOrigin) {
			const others = leaf.tabs.filter((tab) => tab.id !== dragged);
			let index = others.length;
			for (let i = 0; i < others.length; i++) {
				const center =
					others[i]!.rect.left + others[i]!.rect.width / 2;
				if (x < center) {
					index = i;
					break;
				}
			}
			const order = others.map((tab) => tab.id);
			order.splice(index, 0, dragged);
			return { mode: "reorder", anchor: leaf.anchor, order };
		}
		return {
			mode: "dock",
			anchor: anchorFor(leaf, dragged),
			zone: "center",
			rect: leaf.contentRect,
		};
	}
	const zone = dockZone(leaf.contentRect, x, y);
	if (isOrigin && zone === "center") {
		return null;
	}
	return {
		mode: "dock",
		anchor: anchorFor(leaf, dragged),
		zone,
		rect: zoneRect(leaf.contentRect, zone),
	};
};

const pointerXY = (
	event: MouseEvent | TouchEvent | PointerEvent,
): readonly [number, number] => {
	if ("clientX" in event) {
		return [event.clientX, event.clientY];
	}
	const touch = event.touches[0] ?? event.changedTouches[0];
	return touch ? [touch.clientX, touch.clientY] : [0, 0];
};

export const useTabDocking = (
	workspace: WorkspaceState,
	onChange: (workspace: WorkspaceState) => void,
): Readonly<{
	dragging: ViewId | null;
	drop: Readonly<{ rect: Rect; zone: DockZone }> | null;
	activate: (id: ViewId) => void;
	dragProps: (id: ViewId) => Record<string, unknown>;
}> => {
	const [dragging, setDragging] = useState<ViewId | null>(null);
	const [drop, setDrop] = useState<Readonly<{
		rect: Rect;
		zone: DockZone;
	}> | null>(null);
	const draggingRef = useRef<ViewId | null>(null);
	const targetRef = useRef<DropTarget | null>(null);
	const leavesRef = useRef<ReadonlyArray<LeafInfo>>([]);

	const activate = (id: ViewId): void => {
		if (workspace.focused === id) {
			return;
		}
		onChange({
			...workspace,
			root: setActive(workspace.root, id),
			focused: id,
		});
	};

	const commit = (): void => {
		const dragged = draggingRef.current;
		const target = targetRef.current;
		if (!dragged || !target) {
			return;
		}
		if (target.mode === "reorder") {
			onChange({
				...workspace,
				root: setTabsViews(
					workspace.root,
					target.anchor,
					target.order,
				),
			});
		} else {
			onChange({
				...workspace,
				root: moveView(
					workspace.root,
					dragged,
					target.anchor,
					target.zone,
				),
				focused: dragged,
			});
		}
	};

	const dragProps = (id: ViewId): Record<string, unknown> => ({
		drag: true,
		dragSnapToOrigin: true,
		dragElastic: 0,
		dragMomentum: false,
		onDragStart: () => {
			draggingRef.current = id;
			leavesRef.current = collectLeaves();
			setDragging(id);
		},
		onDrag: (
			event: MouseEvent | TouchEvent | PointerEvent,
			_info: PanInfo,
		) => {
			const [x, y] = pointerXY(event);
			const target = resolveTarget(leavesRef.current, id, x, y);
			targetRef.current = target;
			setDrop(
				target && target.mode === "dock"
					? { rect: target.rect, zone: target.zone }
					: null,
			);
		},
		onDragEnd: () => {
			commit();
			draggingRef.current = null;
			targetRef.current = null;
			leavesRef.current = [];
			setDragging(null);
			setDrop(null);
		},
	});

	return { dragging, drop, activate, dragProps };
};

const focusTab = (from: HTMLElement, id: ViewId): void => {
	const strip = from.closest("[data-strip]");
	const target = strip?.querySelector<HTMLElement>(
		`[data-tab="${id}"]`,
	);
	target?.focus();
};

const Tab = ({
	id,
	active,
	single,
	views,
	api,
}: Readonly<{
	id: ViewId;
	active: boolean;
	single: boolean;
	views: ReadonlyArray<ViewId>;
	api: TabApi;
}>) => {
	const Icon = viewIcon(id);

	const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		const index = views.indexOf(id);
		let next = -1;
		if (event.key === "ArrowRight") {
			next = (index + 1) % views.length;
		} else if (event.key === "ArrowLeft") {
			next = (index - 1 + views.length) % views.length;
		} else if (event.key === "Home") {
			next = 0;
		} else if (event.key === "End") {
			next = views.length - 1;
		}
		const target = views[next];
		if (next >= 0 && target) {
			event.preventDefault();
			api.activate(target);
			focusTab(event.currentTarget, target);
		}
	};

	return (
		<motion.div
			role="tab"
			aria-selected={active}
			tabIndex={active ? 0 : -1}
			data-tab={id}
			className={classNames(
				styles.tab,
				single ? styles.tabSingle : active && styles.tabActive,
				api.dragging === id && styles.tabDragging,
			)}
			onMouseUp={(e) => {
				if (e.button === 0) {
					api.activate(id);
				} else if (e.button === 1 && isClosable(id)) {
					api.close(id);
				}
			}}
			onKeyDown={onKeyDown}
			{...api.dragProps(id)}
		>
			<Icon className={styles.tabIcon} />
			<span className={styles.tabTitle}>{viewTitle(id)}</span>
			{isClosable(id) && (
				<Tooltip label="Close">
					<button
						type="button"
						tabIndex={-1}
						className={styles.tabClose}
						data-dirty={api.isDirty(id)}
						onClick={(event) => {
							event.stopPropagation();
							api.close(id);
						}}
						onPointerDown={(event) => event.stopPropagation()}
					>
						<span className={styles.tabDot} />
						<XIcon className={styles.tabX} />
					</button>
				</Tooltip>
			)}
		</motion.div>
	);
};

const TabsView = ({
	node,
	renderView,
	api,
}: Readonly<{
	node: TabsNode;
	renderView: (id: ViewId) => ReactNode;
	api: TabApi;
}>) => (
	<div
		className={classNames(
			styles.slot,
			node.active === api.focused && styles.slotFocused,
		)}
		data-leaf={node.active}
	>
		<div className={styles.strip} data-strip role="tablist">
			{node.views.map((view) => (
				<Tab
					key={view}
					id={view}
					active={view === node.active}
					single={node.views.length === 1}
					views={node.views}
					api={api}
				/>
			))}
		</div>
		<div className={styles.tabContent}>
			{node.views.map((view) => (
				<div
					key={view}
					role="tabpanel"
					className={classNames(
						styles.content,
						view !== node.active && styles.hidden,
					)}
					onPointerDownCapture={() => api.activate(view)}
				>
					{renderView(view)}
				</div>
			))}
		</div>
	</div>
);

export default TabsView;
