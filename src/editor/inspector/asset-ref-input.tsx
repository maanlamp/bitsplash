import type { AssetRef } from "../../engine/asset-ref";
import type { History } from "../history";
import { ImageInput } from "./image-input";
import { FileInput } from "./inputs";
import { commit } from "./inspector";

export const AssetRefInput = ({
	value,
	history,
}: Readonly<{ value: AssetRef; history: History }>) => {
	const onCommit = (path: string): void =>
		commit(history, value, "path", path);
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
