import {
	createElement,
	type ReactElement,
	useSyncExternalStore,
} from "react";
import type { DeviceSnapshot } from "../../src/engine/input/device-snapshot";
import type { GamepadState } from "../../src/engine/input/gamepad";
import {
	View,
	type ViewProps,
} from "../../src/engine/ui/reconciler/ui-elements";
import { UiRuntime } from "../../src/engine/ui/ui-runtime";
import Vector2 from "../../src/engine/vector2";

/**
 * A headless `UiRuntime` with no fonts registered — enough for layout, focus
 * and paint of view/image nodes, which is all the framework-level tests need.
 */
export const headlessUi = (): UiRuntime =>
	new UiRuntime({ resolveFont: () => null, font: () => null });

/** Mounts `element` and commits it synchronously, as a real frame would. */
export const mountSync = (
	ui: UiRuntime,
	element: ReactElement,
): void => {
	ui.root.flushSyncFromReconciler(() => {
		ui.mount(element);
	});
};

/** Runs `mutate` (typically a store write) inside a synchronous commit. */
export const commitSync = (
	ui: UiRuntime,
	mutate: () => void,
): void => {
	ui.root.flushSyncFromReconciler(mutate);
};

/**
 * An external store of node ids, so a test can unmount one node of a mounted
 * list the way real HUD state stores do.
 */
export class IdStore {
	private ids: readonly string[];
	private readonly listeners = new Set<() => void>();

	constructor(ids: readonly string[]) {
		this.ids = ids;
	}

	readonly subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	readonly getSnapshot = (): readonly string[] => this.ids;

	set(ids: readonly string[]): void {
		this.ids = ids;
		for (const listener of this.listeners) {
			listener();
		}
	}
}

export type FocusRowProps = Readonly<{
	store: IdStore;
	rowProps(id: string, index: number): ViewProps;
}>;

/**
 * Renders one keyed, focusable node per id in `store`, so removing an id
 * unmounts exactly that node.
 */
export const FocusRows = ({
	store,
	rowProps,
}: FocusRowProps): ReactElement => {
	const ids = useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
	);
	return createElement(
		View,
		null,
		ids.map((id, index) =>
			createElement(View, { key: id, ...rowProps(id, index) }),
		),
	);
};

const noMouse = {
	buttons: {},
	position: new Vector2(-1000, -1000),
	wheel: new Vector2(0, 0),
	inside: false,
} as const;

/** A device snapshot with the pointer parked well outside the viewport. */
export const snapshot = (
	keys: Record<string, boolean> = {},
	gamepads: Record<string, GamepadState> = {},
): DeviceSnapshot => ({
	keyboard: { keys },
	mouse: noMouse,
	gamepads,
});

/** A single-pad snapshot whose left stick is pushed to `(x, y)`. */
export const stickSnapshot = (x: number, y: number): DeviceSnapshot =>
	snapshot(
		{},
		{
			"0": {
				buttons: {},
				axes: { "0": new Vector2(x, y) },
				id: "test-pad",
				mapping: "standard",
			},
		},
	);
