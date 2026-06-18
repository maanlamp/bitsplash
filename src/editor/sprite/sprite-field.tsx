import type { SpriteComponent } from "../../engine/components/sprite";
import type { History } from "../history";
import { FieldControl } from "../inspector";
import styles from "../preview-field.module.scss";

const SpriteField = ({
	value,
	history,
}: Readonly<{ value: SpriteComponent; history: History }>) => (
	<div className={styles.field}>
		<FieldControl
			component={value}
			fieldKey="url"
			value={value.url}
			history={history}
		/>
		<div className={styles.inputs}>
			<span className={styles.label}>Opacity</span>
			<FieldControl
				component={value}
				fieldKey="opacity"
				value={value.opacity}
				history={history}
			/>
			<span className={styles.label}>Flip X</span>
			<FieldControl
				component={value}
				fieldKey="flipX"
				value={value.flipX}
				history={history}
			/>
		</div>
	</div>
);

export default SpriteField;
