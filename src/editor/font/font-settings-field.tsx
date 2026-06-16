import type { FontSettings } from "../../engine/font-settings";
import { STYLE_REGULAR } from "../../engine/load";
import { useAssetManager } from "../asset-manager-context";
import type { History } from "../history";
import {
	commit,
	EnumField,
	FieldControl,
	NumberField,
} from "../inspector";
import PreviewField from "../preview-field";
import styles from "../preview-field.module.scss";
import {
	BlittedLine,
	STYLE_OPTIONS,
	useFamilies,
} from "./font-preview";

const PREVIEW_ZOOM = 2;
const PREVIEW_TEXT = "Aa";

const FontSettingsField = ({
	value,
	history,
}: Readonly<{ value: FontSettings; history: History }>) => {
	const assetManager = useAssetManager();
	const families = useFamilies(assetManager, value.font, value.size);
	const font = families
		? (families.find((f) => f.name === value.family) ??
			families[0] ??
			null)
		: null;
	const style =
		STYLE_OPTIONS.find((o) => o.label === value.variant)?.id ??
		STYLE_REGULAR;
	const familyNames = families?.map((f) => f.name) ?? [];

	return (
		<PreviewField
			top={
				<FieldControl
					component={value}
					fieldKey="font"
					value={value.font}
					history={history}
				/>
			}
			preview={
				font ? (
					<BlittedLine
						font={font}
						text={PREVIEW_TEXT}
						style={style}
						zoom={PREVIEW_ZOOM}
					/>
				) : (
					<span className={styles.previewEmpty}>Aa</span>
				)
			}
		>
			<span className={styles.label}>Size</span>
			<NumberField
				value={value.size}
				onCommit={(n) => commit(history, value, "size", n)}
				inlayHint="px"
			/>
			<span className={styles.label}>Family</span>
			<EnumField
				value={value.family || (font?.name ?? "")}
				options={familyNames}
				onCommit={(v) => commit(history, value, "family", v)}
			/>
			<span className={styles.label}>Variant</span>
			<FieldControl
				component={value}
				fieldKey="variant"
				value={value.variant}
				history={history}
			/>
		</PreviewField>
	);
};

export default FontSettingsField;
