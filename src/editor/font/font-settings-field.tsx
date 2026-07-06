import { STYLE_REGULAR } from "../../engine/load";
import {
	FontSettings,
	fontStyleLabels,
} from "../../engine/text/font-settings";
import { useAssetManager } from "../asset-manager-context";
import type { History } from "../history";
import { Adornment, Field } from "../inspector/field";
import {
	EnumSelect,
	FileInput,
	NumberInput,
} from "../inspector/inputs";
import { commit } from "../inspector/inspector";
import { Preview } from "../inspector/preview";
import styles from "../inspector/preview.module.scss";
import {
	BlittedLine,
	STYLE_OPTIONS,
	useFamilies,
} from "./font-preview";

const PREVIEW_ZOOM = 2;
const PREVIEW_TEXT = "Aa";
const FONT_ACCEPT = ".ttf,.otf,.woff,.woff2,.font.zip";

const FontSettingsField = ({
	value,
	history,
}: Readonly<{ value: FontSettings; history: History }>) => {
	const assetManager = useAssetManager();
	const families = useFamilies(
		assetManager,
		value.fontRef.path,
		value.size,
	);
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
		<Preview.Root>
			<Field.Root invalid={!value.fontRef.path}>
				<FileInput
					value={value.fontRef.path}
					accept={FONT_ACCEPT}
					onCommit={(s) => commit(history, value.fontRef, "path", s)}
				/>
				{!value.fontRef.path && (
					<Field.Error match>Required</Field.Error>
				)}
			</Field.Root>
			<Preview.Body>
				<Preview.Box>
					{font ? (
						<BlittedLine
							font={font}
							text={PREVIEW_TEXT}
							style={style}
							zoom={PREVIEW_ZOOM}
						/>
					) : (
						<span className={styles.previewEmpty}>Aa</span>
					)}
				</Preview.Box>
				<Preview.Inputs>
					<Field.Row>
						<Field.Root>
							<Field.Label>Size</Field.Label>
							<NumberInput
								value={value.size}
								onCommit={(n) => commit(history, value, "size", n)}
							>
								<Adornment>px</Adornment>
							</NumberInput>
						</Field.Root>
						<Field.Root>
							<Field.Label>Variant</Field.Label>
							<EnumSelect
								value={value.variant}
								options={fontStyleLabels}
								onCommit={(v) => commit(history, value, "variant", v)}
							/>
						</Field.Root>
					</Field.Row>
					<Field.Root>
						<Field.Label>Family</Field.Label>
						<EnumSelect
							value={value.family || (font?.name ?? "")}
							options={familyNames}
							onCommit={(v) => commit(history, value, "family", v)}
						/>
					</Field.Root>
				</Preview.Inputs>
			</Preview.Body>
		</Preview.Root>
	);
};

export default FontSettingsField;
