import type Angle from "../../engine/angle";
import type { FieldBinding } from "../commands";
import { Adornment } from "./field";
import { NumberInput } from "./inputs";

const DEG_PER_RAD = 180 / Math.PI;

const round = (n: number): number => Math.round(n * 100) / 100;

export const AngleInput = ({
	value,
	binding,
}: Readonly<{ value: Angle; binding: FieldBinding }>) => (
	<NumberInput
		value={round(value.radians * DEG_PER_RAD)}
		step={1}
		largeStep={15}
		onCommit={(deg) => binding.commit(["radians"], deg / DEG_PER_RAD)}
	>
		<Adornment>°</Adornment>
	</NumberInput>
);
