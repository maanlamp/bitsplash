import Angle from "../../engine/angle";
import { Easing } from "../../engine/animation/easing";
import { AssetRef } from "../../engine/asset-ref";
import { Color } from "../../engine/color";
import { Duration } from "../../engine/duration";
import { EntityRef } from "../../engine/entity-ref";
import { Percent } from "../../engine/percent";
import { SpriteComponent } from "../../engine/sprite/sprite-component";
import { FontSettings } from "../../engine/text/font-settings";
import Vector2 from "../../engine/vector2";
import { ColorField } from "../color/color-field";
import FontSettingsField from "../font/font-settings-field";
import SpriteField from "../sprite/sprite-field";
import { AngleInput } from "./angle-input";
import { AssetRefInput } from "./asset-ref-input";
import { DurationInput } from "./duration-input";
import { EasingSelect } from "./easing-select";
import { EntityRefPicker } from "./entity-ref-picker";
import { Adornment, Field } from "./field";
import { NumberInput } from "./inputs";
import { PercentInput } from "./percent-input";
import { registerValueRenderer } from "./value-renderers";

registerValueRenderer(Angle, ({ value, binding }) => (
	<AngleInput value={value} binding={binding} />
));

registerValueRenderer(Duration, ({ value, binding }) => (
	<DurationInput value={value} binding={binding} />
));

registerValueRenderer(Percent, ({ value, binding }) => (
	<PercentInput value={value} binding={binding} />
));

registerValueRenderer(Color, ({ value, binding }) => (
	<ColorField value={value.css} binding={binding} />
));

registerValueRenderer(EntityRef, ({ value, binding }) => (
	<EntityRefPicker value={value} binding={binding} />
));

registerValueRenderer(Easing, ({ value, binding }) => (
	<EasingSelect value={value} binding={binding} />
));

registerValueRenderer(AssetRef, ({ value, binding }) => (
	<AssetRefInput value={value} binding={binding} />
));

registerValueRenderer(Vector2, ({ value, binding }) => (
	<Field.Row>
		<NumberInput
			value={value.x}
			onCommit={(n) => binding.commit(["x"], n)}
		>
			<Adornment>X</Adornment>
		</NumberInput>
		<NumberInput
			value={value.y}
			onCommit={(n) => binding.commit(["y"], n)}
		>
			<Adornment>Y</Adornment>
		</NumberInput>
	</Field.Row>
));

registerValueRenderer(FontSettings, ({ value, binding }) => (
	<FontSettingsField value={value} binding={binding} />
));

registerValueRenderer(SpriteComponent, ({ value, binding }) => (
	<SpriteField value={value} binding={binding} />
));
