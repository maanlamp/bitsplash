import type { EntityId } from "../../engine/ecs";
import type { EntityRef } from "../../engine/entity-ref";
import type { History } from "../history";
import type { SelectOption } from "../../engine/serialization/serializable-value";
import { useInspectorEcs } from "./inspector-ecs-context";
import { EnumSelect } from "./inputs";
import { commit } from "./inspector";

const NONE = "";

export const EntityRefPicker = ({
	value,
	history,
}: Readonly<{ value: EntityRef; history: History }>) => {
	const ecs = useInspectorEcs();
	const ids = ecs ? [...ecs.entities()] : [];
	const options: SelectOption[] = [
		{ label: "None", value: NONE },
		...ids.map((id) => ({ label: id.slice(0, 8), value: id })),
	];
	return (
		<EnumSelect
			value={value.id ?? NONE}
			options={options}
			onCommit={(v) =>
				commit(
					history,
					value,
					"id",
					v === NONE ? null : (v as EntityId),
				)
			}
		/>
	);
};
