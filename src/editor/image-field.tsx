import classNames from "classnames";
import { useState } from "react";
import {
	AssetDropRegistry,
	DRAG_MIME,
	type DropContext,
	readDragPayload,
} from "./asset-drop-registry";
import styles from "./image-field.module.scss";
import { openImageDialog, resolveToWebPath } from "./project-io";

export const ImageField = ({
	value,
	invalid,
	component,
	fieldKey,
	onCommit,
}: Readonly<{
	value: string;
	invalid?: boolean;
	component: object;
	fieldKey: string;
	onCommit: (path: string) => void;
}>) => {
	const [dragging, setDragging] = useState(false);
	const [dims, setDims] = useState<{ w: number; h: number } | null>(
		null,
	);

	const pick = (): void => {
		void openImageDialog().then((path) => {
			if (path) {
				void resolveToWebPath(path).then(onCommit);
			}
		});
	};

	const context: DropContext = {
		target: "inspector-field",
		field: {
			componentType: component.constructor.name,
			fieldKey,
			apply: onCommit,
		},
	};

	return (
		<div className={styles.field}>
			<button
				type="button"
				aria-label="Choose image"
				className={classNames(
					styles.preview,
					dragging && styles.dropping,
					invalid && styles.invalid,
				)}
				onClick={pick}
				onDragOver={(event) => {
					if (event.dataTransfer.types.includes(DRAG_MIME)) {
						event.preventDefault();
						setDragging(true);
					}
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={(event) => {
					setDragging(false);
					const payload = readDragPayload(event.dataTransfer);
					if (!payload) {
						return;
					}
					const handler = AssetDropRegistry.resolve(payload, context);
					if (handler) {
						event.preventDefault();
						handler(payload, context);
					}
				}}
			>
				{value ? (
					<img
						key={value}
						src={value}
						alt=""
						className={styles.image}
						onLoad={(event) =>
							setDims({
								w: event.currentTarget.naturalWidth,
								h: event.currentTarget.naturalHeight,
							})
						}
					/>
				) : (
					<span className={styles.placeholder}>
						{dragging ? "Drop image here" : "Choose image\u2026"}
					</span>
				)}
			</button>
			{value && (
				<div className={styles.caption}>
					<span className={styles.path}>{value}</span>
					{dims && (
						<span className={styles.dims}>
							{`${dims.w} \u00d7 ${dims.h}`}
						</span>
					)}
				</div>
			)}
		</div>
	);
};
