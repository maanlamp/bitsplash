import {
	type Easing,
	easingNames,
} from "../../engine/animation/easing";
import type { FieldBinding } from "../commands";
import { EnumSelect } from "./inputs";

export const EasingSelect = ({
	value,
	binding,
}: Readonly<{ value: Easing; binding: FieldBinding }>) => (
	<EnumSelect
		value={value.name}
		options={easingNames}
		onCommit={(v) => binding.commit(["name"], v as string)}
	/>
);
