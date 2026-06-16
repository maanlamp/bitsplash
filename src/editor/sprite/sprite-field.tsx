import type { SpriteComponent } from "../../engine/components/sprite";
import type { History } from "../history";
import { commit, FieldControl, NumberField } from "../inspector";
import PreviewField from "../preview-field";
import styles from "../preview-field.module.scss";

const SpriteField = ({
	value,
	history,
}: Readonly<{ value: SpriteComponent; history: History }>) => (
	<PreviewField
		top={
			<FieldControl
				component={value}
				fieldKey="url"
				value={value.url}
				history={history}
			/>
		}
		preview={
			value.url ? (
				<img src={value.url} alt="" className={styles.previewImage} />
			) : (
				<span className={styles.previewEmpty}>?</span>
			)
		}
	>
		<span className={styles.label}>Width</span>
		<NumberField
			value={value.width}
			onCommit={(n) => commit(history, value, "width", n)}
			inlayHint="px"
		/>
		<span className={styles.label}>Height</span>
		<NumberField
			value={value.height}
			onCommit={(n) => commit(history, value, "height", n)}
			inlayHint="px"
		/>
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
	</PreviewField>
);

export default SpriteField;
