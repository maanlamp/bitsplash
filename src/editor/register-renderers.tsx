import Angle from "../engine/angle";
import { SpriteComponent } from "../engine/sprite/sprite-component";
import { FontSettings } from "../engine/text/font-settings";
import Vector2 from "../engine/vector2";
import FontSettingsField from "./font/font-settings-field";
import { AngleField, Vector2Field } from "./inspector";
import SpriteField from "./sprite/sprite-field";
import { registerValueRenderer } from "./value-renderers";

registerValueRenderer(Angle, ({ value, history }) => (
	<AngleField
		component={value}
		fieldKey="radians"
		value={value}
		history={history}
	/>
));

registerValueRenderer(Vector2, ({ value, history }) => (
	<Vector2Field value={value} history={history} />
));

registerValueRenderer(FontSettings, ({ value, history }) => (
	<FontSettingsField value={value} history={history} />
));

registerValueRenderer(SpriteComponent, ({ value, history }) => (
	<SpriteField value={value} history={history} />
));
