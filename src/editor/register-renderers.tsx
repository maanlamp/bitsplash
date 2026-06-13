import Angle from "../engine/angle";
import Vector2 from "../engine/vector2";
import { AngleField, Vector2Field } from "./inspector";
import { registerValueRenderer } from "./value-renderers";
// import FontSettings from "../game/font-settings";

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
