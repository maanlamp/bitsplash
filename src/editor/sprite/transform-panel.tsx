import { NumberField } from "@base-ui/react/number-field";
import { useSyncExternalStore } from "react";
import Button from "../button";
import type { SelectionController } from "./selection-controller";
import styles from "./transform-panel.module.scss";

const DEG = 180 / Math.PI;

const Field = ({
	label,
	value,
	step,
	onChange,
}: Readonly<{
	label: string;
	value: number;
	step?: number;
	onChange: (n: number) => void;
}>) => (
	<label className={styles.field}>
		<span>{label}</span>
		<NumberField.Root
			value={value}
			step={step ?? 1}
			onValueChange={(next) => {
				if (next !== null && Number.isFinite(next)) {
					onChange(next);
				}
			}}
		>
			<NumberField.Group className={styles.group}>
				<NumberField.Input
					className={styles.input}
					aria-label={label}
				/>
			</NumberField.Group>
		</NumberField.Root>
	</label>
);

/**
 * The numeric free-transform controls, shown while a transform is being edited
 * on the floating selection. Precise scale (%), rotation and skew (degrees) and
 * pivot (cells) entry, plus confirm/cancel — the fully-deterministic complement
 * to the on-canvas handle drags (which are a basic first cut). Values round-trip
 * through {@link SelectionController.updateTransform}, so editing a field and
 * dragging a handle stay in sync.
 *
 * Docked top-centre in the sprite body; a conventional placement flagged for
 * feedback.
 */
const TransformPanel = ({
	selection,
}: Readonly<{ selection: SelectionController }>) => {
	const session = useSyncExternalStore(
		selection.subscribe,
		() => selection.transformSession,
	);
	if (!session) {
		return null;
	}
	const { params, pivot } = session;
	return (
		<div className={styles.panel}>
			<div className={styles.header}>
				<span className={styles.heading}>Free transform</span>
			</div>
			<div className={styles.grid}>
				<Field
					label="Scale X %"
					value={Math.round(params.scaleX * 1000) / 10}
					onChange={(n) =>
						selection.updateTransform({ scaleX: n / 100 })
					}
				/>
				<Field
					label="Scale Y %"
					value={Math.round(params.scaleY * 1000) / 10}
					onChange={(n) =>
						selection.updateTransform({ scaleY: n / 100 })
					}
				/>
				<Field
					label="Rotate °"
					value={Math.round(params.rotate * DEG * 10) / 10}
					onChange={(n) =>
						selection.updateTransform({ rotate: n / DEG })
					}
				/>
				<Field
					label="Skew X °"
					value={Math.round(params.skewX * DEG * 10) / 10}
					onChange={(n) =>
						selection.updateTransform({ skewX: n / DEG })
					}
				/>
				<Field
					label="Skew Y °"
					value={Math.round(params.skewY * DEG * 10) / 10}
					onChange={(n) =>
						selection.updateTransform({ skewY: n / DEG })
					}
				/>
				<Field
					label="Pivot X"
					value={Math.round(pivot.x * 10) / 10}
					onChange={(n) => selection.setTransformPivot(n, pivot.y)}
				/>
				<Field
					label="Pivot Y"
					value={Math.round(pivot.y * 10) / 10}
					onChange={(n) => selection.setTransformPivot(pivot.x, n)}
				/>
			</div>
			<div className={styles.actions}>
				<Button onClick={() => selection.cancelTransform()}>
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={() => selection.confirmTransform()}
				>
					Apply
				</Button>
			</div>
		</div>
	);
};

export default TransformPanel;
