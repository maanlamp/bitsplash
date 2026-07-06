import {
	type Easing,
	easingNames,
} from "../../engine/animation/easing";
import type { History } from "../history";
import { EnumSelect } from "./inputs";
import { commit } from "./inspector";

export const EasingSelect = ({
	value,
	history,
}: Readonly<{ value: Easing; history: History }>) => (
	<EnumSelect
		value={value.name}
		options={easingNames}
		onCommit={(v) => commit(history, value, "name", v as string)}
	/>
);
