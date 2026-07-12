import type { Story } from "inkjs/full";
import { InkStoryComponent } from "../../engine/ink/ink-story-component";
import type { ReadonlyECS } from "../../engine/ecs";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { ChronicleComponent } from "./chronicle-component";

export class ChronicleInkMirrorSystem implements UpdateSystem {
	private mirrored: Story | null = null;

	update({ ecs }: UpdateContext): void {
		const story = ecs.query(InkStoryComponent)[0]?.[1].story ?? null;
		if (!story || story === this.mirrored) {
			return;
		}
		if (this.mirror(ecs, story)) {
			this.mirrored = story;
		}
	}

	private mirror(ecs: ReadonlyECS, story: Story): boolean {
		const chronicle = ecs.query(ChronicleComponent)[0]?.[1];
		if (!chronicle) {
			return false;
		}
		for (const [key, value] of chronicle.entries()) {
			if (story.variablesState[key] !== null) {
				story.variablesState[key] = value;
			}
		}
		return true;
	}
}
