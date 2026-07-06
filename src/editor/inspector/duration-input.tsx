import type { Duration } from "../../engine/duration";
import type { FieldBinding } from "../commands";
import { Adornment } from "./field";
import { NumberInput } from "./inputs";

export const DurationInput = ({
	value,
	binding,
}: Readonly<{ value: Duration; binding: FieldBinding }>) => (
	<NumberInput
		value={value.seconds}
		step={0.05}
		min={0}
		onCommit={(n) => binding.commit(["seconds"], n)}
	>
		<Adornment>s</Adornment>
	</NumberInput>
);
