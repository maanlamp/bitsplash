import type { UiEvent, UiEventEntry } from "./ui-event";

export class UiEventQueue {
	private readonly items: UiEventEntry[] = [];

	push(event: UiEvent): UiEventEntry {
		const entry: UiEventEntry = { event, consumed: false };
		this.items.push(entry);
		return entry;
	}

	get entries(): readonly UiEventEntry[] {
		return this.items;
	}

	clear(): void {
		this.items.length = 0;
	}
}
