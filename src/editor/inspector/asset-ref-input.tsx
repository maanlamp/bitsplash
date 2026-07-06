import type { AssetRef } from "../../engine/asset-ref";
import type { FieldBinding } from "../commands";
import { ImageInput } from "./image-input";
import { FileInput } from "./inputs";

export const AssetRefInput = ({
	value,
	binding,
}: Readonly<{ value: AssetRef; binding: FieldBinding }>) => {
	const onCommit = (path: string): void =>
		binding.commit(["path"], path);
	if (/image/i.test(value.accept)) {
		return (
			<ImageInput
				value={value.path}
				component={value}
				fieldKey="path"
				onCommit={onCommit}
			/>
		);
	}
	return (
		<FileInput
			value={value.path}
			accept={value.accept}
			onCommit={onCommit}
		/>
	);
};
