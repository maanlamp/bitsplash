import type { Runtime } from "../runtime/runtime";
import type { SaveManager } from "./save-manager";
import type { SaveStore } from "./save-store";

export type SaveKind = "auto" | "quick" | "manual";

export type SaveMetadata = Readonly<{
	slot: string;
	kind: SaveKind;
	savedAt: number;
	label: string;
}>;

export type SaveDriverOptions = Readonly<{
	runtime: Runtime;
	manager: SaveManager;
	store: SaveStore;
	createRuntime: () => Runtime;
	now: () => number;
	autosaveIntervalMs: number;
	onRuntimeChanged?: (runtime: Runtime) => void;
}>;

const SEPARATOR = "__";
const KINDS: ReadonlyArray<SaveKind> = ["auto", "quick", "manual"];

const formatSlot = (
	kind: SaveKind,
	savedAt: number,
	label: string,
): string =>
	[kind, String(savedAt), encodeURIComponent(label)].join(SEPARATOR);

export const parseSlot = (slot: string): SaveMetadata | undefined => {
	const parts = slot.split(SEPARATOR);
	if (parts.length < 3) {
		return undefined;
	}
	const [kind, savedAtRaw, ...rest] = parts;
	const savedAt = Number(savedAtRaw);
	if (
		!KINDS.includes(kind as SaveKind) ||
		!Number.isFinite(savedAt)
	) {
		return undefined;
	}
	return {
		slot,
		kind: kind as SaveKind,
		savedAt,
		label: decodeURIComponent(rest.join(SEPARATOR)),
	};
};

export class SaveDriver {
	private readonly manager: SaveManager;
	private readonly store: SaveStore;
	private readonly createRuntime: () => Runtime;
	private readonly now: () => number;
	private readonly autosaveIntervalMs: number;
	private readonly onRuntimeChanged?: (runtime: Runtime) => void;

	private current: Runtime;
	private elapsedMs = 0;

	constructor(options: SaveDriverOptions) {
		this.current = options.runtime;
		this.manager = options.manager;
		this.store = options.store;
		this.createRuntime = options.createRuntime;
		this.now = options.now;
		this.autosaveIntervalMs = options.autosaveIntervalMs;
		this.onRuntimeChanged = options.onRuntimeChanged;
	}

	get runtime(): Runtime {
		return this.current;
	}

	canSave(): boolean {
		return true;
	}

	async onSceneTransition(): Promise<boolean> {
		return this.autosave();
	}

	async tick(dtMs: number): Promise<boolean> {
		this.elapsedMs += dtMs;
		if (this.elapsedMs < this.autosaveIntervalMs) {
			return false;
		}
		if (!this.canSave()) {
			return false;
		}
		this.elapsedMs = 0;
		return this.autosave();
	}

	async quickSave(): Promise<boolean> {
		if (!this.canSave()) {
			return false;
		}
		await this.writeSave("quick", "");
		return true;
	}

	async quickLoad(): Promise<boolean> {
		const latest = await this.latestOfKind("quick");
		if (!latest) {
			return false;
		}
		return this.load(latest.slot);
	}

	async manualSave(name: string): Promise<string> {
		return this.writeSave("manual", name);
	}

	async listSaves(): Promise<ReadonlyArray<SaveMetadata>> {
		const slots = await this.store.list();
		const metas: SaveMetadata[] = [];
		for (const slot of slots) {
			const meta = parseSlot(slot);
			if (meta) {
				metas.push(meta);
			}
		}
		return metas.sort((a, b) => b.savedAt - a.savedAt);
	}

	async deleteSave(slot: string): Promise<void> {
		await this.store.delete(slot);
	}

	async load(slot: string): Promise<boolean> {
		const blob = await this.store.read(slot);
		if (!blob) {
			return false;
		}
		const next = this.createRuntime();
		await this.manager.restore(next, blob);
		this.current.dispose();
		this.current = next;
		this.elapsedMs = 0;
		this.onRuntimeChanged?.(next);
		return true;
	}

	async continueLatest(): Promise<boolean> {
		const saves = await this.listSaves();
		const latest = saves[0];
		if (!latest) {
			return false;
		}
		return this.load(latest.slot);
	}

	private async autosave(): Promise<boolean> {
		if (!this.canSave()) {
			return false;
		}
		await this.writeSave("auto", "");
		return true;
	}

	private async writeSave(
		kind: SaveKind,
		label: string,
	): Promise<string> {
		const savedAt = this.now();
		const slot = formatSlot(kind, savedAt, label);
		const blob = await this.manager.capture(this.current, savedAt);
		await this.store.write(slot, blob);
		return slot;
	}

	private async latestOfKind(
		kind: SaveKind,
	): Promise<SaveMetadata | undefined> {
		const saves = await this.listSaves();
		return saves.find((meta) => meta.kind === kind);
	}
}
