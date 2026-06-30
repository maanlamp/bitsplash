import { Subscribable } from "./subscribable";

export type DebugOverlayId = "colliders" | "sensors" | "transforms";

export type DebugOverlay = Readonly<{
	id: DebugOverlayId;
	label: string;
	colorToken: string;
}>;

export const DEBUG_OVERLAYS: ReadonlyArray<DebugOverlay> = [
	{
		id: "colliders",
		label: "Colliders",
		colorToken: "--debug-collider",
	},
	{ id: "sensors", label: "Sensors", colorToken: "--debug-sensor" },
	{
		id: "transforms",
		label: "Transforms",
		colorToken: "--debug-transform",
	},
];

export const DEBUG_OVERLAY: Readonly<
	Record<DebugOverlayId, DebugOverlay>
> = Object.fromEntries(
	DEBUG_OVERLAYS.map((overlay) => [overlay.id, overlay]),
) as Record<DebugOverlayId, DebugOverlay>;

const STORAGE_KEY = "editor.debugFlags";

const load = (): Record<DebugOverlayId, boolean> => {
	const flags = {} as Record<DebugOverlayId, boolean>;
	for (const overlay of DEBUG_OVERLAYS) {
		flags[overlay.id] = true;
	}
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const stored = JSON.parse(raw) as Partial<
				Record<DebugOverlayId, boolean>
			>;
			for (const overlay of DEBUG_OVERLAYS) {
				const value = stored[overlay.id];
				if (typeof value === "boolean") {
					flags[overlay.id] = value;
				}
			}
		}
	} catch {}
	return flags;
};

export class DebugFlags extends Subscribable {
	private flags = load();

	get(id: DebugOverlayId): boolean {
		return this.flags[id];
	}

	set(id: DebugOverlayId, value: boolean): void {
		if (this.flags[id] === value) {
			return;
		}
		this.flags[id] = value;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.flags));
		} catch {}
		this.notify();
	}

	toggle(id: DebugOverlayId): void {
		this.set(id, !this.flags[id]);
	}
}
