import clsx from "clsx";
import { useState, type ReactNode } from "react";
import {
	AssetDropRegistry,
	DRAG_MIME,
	type DropContext,
	readDragPayload,
} from "../asset-drop-registry";
import { openImageDialog, resolveToWebPath } from "../project-io";
import styles from "./image-input.module.scss";
import { Preview } from "./preview";

type ImageDropProps = Readonly<{
	onClick: () => void;
	onDragOver: (event: React.DragEvent) => void;
	onDragLeave: () => void;
	onDrop: (event: React.DragEvent) => void;
}>;

export const useImageDrop = ({
	component,
	fieldKey,
	onCommit,
}: Readonly<{
	component: object;
	fieldKey: string;
	onCommit: (path: string) => void;
}>): { dragging: boolean; rootProps: ImageDropProps } => {
	const [dragging, setDragging] = useState(false);

	const context: DropContext = {
		target: "inspector-field",
		field: {
			componentType: component.constructor.name,
			fieldKey,
			apply: onCommit,
		},
	};

	const rootProps: ImageDropProps = {
		onClick: () => {
			void openImageDialog().then((path) => {
				if (path) {
					void resolveToWebPath(path).then(onCommit);
				}
			});
		},
		onDragOver: (event) => {
			if (event.dataTransfer.types.includes(DRAG_MIME)) {
				event.preventDefault();
				setDragging(true);
			}
		},
		onDragLeave: () => setDragging(false),
		onDrop: (event) => {
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
		},
	};

	return { dragging, rootProps };
};

export const ImagePreview = ({
	value,
	dragging,
	rootProps,
	onDims,
	className,
	children,
}: Readonly<{
	value: string;
	dragging: boolean;
	rootProps: ImageDropProps;
	onDims?: (dims: { w: number; h: number }) => void;
	className?: string;
	children?: ReactNode;
}>) => (
	<Preview.Box
		render={<button type="button" aria-label="Choose image" />}
		className={clsx(
			styles.preview,
			dragging && styles.dropping,
			className,
		)}
		{...rootProps}
	>
		{value ? (
			<img
				key={value}
				src={value}
				alt=""
				className={styles.image}
				onLoad={(event) =>
					onDims?.({
						w: event.currentTarget.naturalWidth,
						h: event.currentTarget.naturalHeight,
					})
				}
			/>
		) : (
			<span className={styles.placeholder}>
				{dragging ? "Drop image here" : "Choose image…"}
			</span>
		)}
		{children}
	</Preview.Box>
);

export const ImageInput = ({
	value,
	component,
	fieldKey,
	onCommit,
}: Readonly<{
	value: string;
	component: object;
	fieldKey: string;
	onCommit: (path: string) => void;
}>) => {
	const { dragging, rootProps } = useImageDrop({
		component,
		fieldKey,
		onCommit,
	});
	const [dims, setDims] = useState<{ w: number; h: number } | null>(
		null,
	);
	return (
		<div className={styles.field}>
			<ImagePreview
				value={value}
				dragging={dragging}
				rootProps={rootProps}
				onDims={setDims}
				className={styles.full}
			/>
			{value && (
				<div className={styles.caption}>
					<span className={styles.path}>{value}</span>
					{dims && (
						<span className={styles.dims}>
							{`${dims.w} × ${dims.h}`}
						</span>
					)}
				</div>
			)}
		</div>
	);
};
