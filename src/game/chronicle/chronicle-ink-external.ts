import type { Story } from "inkjs/full";
import type { ReadonlyECS } from "../../engine/ecs";
import { ChronicleComponent } from "./chronicle-component";

export const bindSetChronicle = (
	story: Story,
	ecs: ReadonlyECS,
): void => {
	story.BindExternalFunction(
		"set_chronicle",
		(key: string, value: string) => {
			ecs.query(ChronicleComponent)[0]?.[1].set(key, value);
		},
		false,
	);
};
