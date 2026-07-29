import type { SelectOption } from "../../engine/serialization/serializable-value";
import {
	climateIds,
	defaultClimateId,
} from "../../engine/weather/climate-registry";
import type { SceneClimateComponent } from "../../engine/weather/scene-climate-component";
import type { FieldBinding } from "../commands";
import { Field } from "../inspector/field";
import { Checkbox, EnumSelect } from "../inspector/inputs";
import { Preview } from "../inspector/preview";

/**
 * The sentinel that stands for `climateId: null` — inherit the catalog's default.
 * `EnumSelect` deals in strings, so the empty option carries the null through, the
 * same way the entity-ref picker's "None" does.
 */
const INHERIT = "";

const climateOptions = (): SelectOption[] => {
	const fallback = defaultClimateId();
	return [
		{
			label: fallback === null ? "Default" : `Default (${fallback})`,
			value: INHERIT,
		},
		...climateIds().map((id) => ({ label: id, value: id })),
	];
};

/**
 * The `SceneClimate` inspector: which climate schedules this scene, and whether it
 * reads as an interior.
 *
 * A whole-component renderer rather than two field renderers, for two reasons.
 * `climateId` is `string | null` and the generic inspector has no null case, so an
 * inherited climate would render as an empty text box. And the options are the
 * *catalog's*, read at render time — `@serialize({ options })` is captured when the
 * decorator runs, long before the game registers its climates, so it would always
 * be empty. Sourcing them live is also what makes a dangling climate id
 * unauthorable: the picker can only offer climates that exist.
 */
const SceneClimateField = ({
	value,
	binding,
}: Readonly<{
	value: SceneClimateComponent;
	binding: FieldBinding;
}>) => (
	<Preview.Root>
		<Field.Root>
			<Field.Label>Climate</Field.Label>
			<EnumSelect
				value={value.climateId ?? INHERIT}
				options={climateOptions()}
				onCommit={(v) =>
					binding.commit(["climateId"], v === INHERIT ? null : v)
				}
			/>
		</Field.Root>
		<Field.Root>
			<Checkbox
				checked={value.indoor}
				onCheckedChange={(checked) =>
					binding.commit(["indoor"], checked)
				}
			/>
			<Field.Label>Indoor</Field.Label>
		</Field.Root>
	</Preview.Root>
);

export default SceneClimateField;
