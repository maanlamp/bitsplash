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
import { commit } from "./inspector";
import { PercentInput } from "./percent-input";
import { registerValueRenderer } from "./value-renderers";

registerValueRenderer(Angle, ({ value, history }) => (
	<AngleInput value={value} history={history} />
));

registerValueRenderer(Duration, ({ value, history }) => (
	<DurationInput value={value} history={history} />
));

registerValueRenderer(Percent, ({ value, history }) => (
	<PercentInput value={value} history={history} />
));

registerValueRenderer(Color, ({ value, history }) => (
	<ColorField
		component={value}
		fieldKey="css"
		value={value.css}
		history={history}
	/>
));

registerValueRenderer(EntityRef, ({ value, history }) => (
	<EntityRefPicker value={value} history={history} />
));

registerValueRenderer(Easing, ({ value, history }) => (
	<EasingSelect value={value} history={history} />
));

registerValueRenderer(AssetRef, ({ value, history }) => (
	<AssetRefInput value={value} history={history} />
));

registerValueRenderer(Vector2, ({ value, history }) => (
	<Field.Row>
		<NumberInput
			value={value.x}
			onCommit={(n) => commit(history, value, "x", n)}
		>
			<Adornment>X</Adornment>
		</NumberInput>
		<NumberInput
			value={value.y}
			onCommit={(n) => commit(history, value, "y", n)}
		>
			<Adornment>Y</Adornment>
		</NumberInput>
	</Field.Row>
));

registerValueRenderer(FontSettings, ({ value, history }) => (
	<FontSettingsField value={value} history={history} />
));

registerValueRenderer(SpriteComponent, ({ value, history }) => (
	<SpriteField value={value} history={history} />
));
