import type { ReactNode } from "react";
import styles from "./preview-field.module.scss";

export const PreviewField = ({
	top,
	preview,
	children,
}: Readonly<{
	top: ReactNode;
	preview: ReactNode;
	children: ReactNode;
}>) => (
	<div className={styles.field}>
		{top}
		<div className={styles.body}>
			<div className={styles.preview}>{preview}</div>
			<div className={styles.inputs}>{children}</div>
		</div>
	</div>
);

export default PreviewField;
