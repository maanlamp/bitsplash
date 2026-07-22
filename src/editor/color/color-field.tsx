import { Popover } from "@base-ui/react/popover";
import clsx from "clsx";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ColorResolver } from "../../engine/render/color-resolver";
import type { FieldBinding } from "../commands";
import surface from "../styles/surface.module.scss";
import { Subscribable } from "../subscribable";
import ColorPanel, { swatchBackground } from "./color-panel";
import type { ColorPickerModel } from "./color-model";
import styles from "./color-picker.module.scss";
import OklchField from "./oklch-field";
import {
	chromaInGamut,
	oklchCss,
	type OklchColor,
	rgbToOklch,
} from "./oklch";

const resolver = new ColorResolver();

const toOklch = (css: string): OklchColor => {
	const [r, g, b, a] = resolver.resolve(css || "transparent");
	const { l, c, h } = rgbToOklch(r * 255, g * 255, b * 255);
	return { l, c, h, alpha: a };
};

// A ColorPickerModel bound to a serializable string field. Live edits mutate
// the field directly (so a scene view reading it each frame previews the
// change); `commit` records one history entry spanning the whole gesture.
class FieldColorModel
	extends Subscribable
	implements ColorPickerModel
{
	private _color: OklchColor;
	private baseline: string;

	constructor(
		private readonly binding: FieldBinding,
		private readonly key: string,
		initial: string,
	) {
		super();
		this.baseline = initial;
		this._color = toOklch(initial);
	}

	get l(): number {
		return this._color.l;
	}
	get c(): number {
		return this._color.c;
	}
	get h(): number {
		return this._color.h;
	}
	get alpha(): number {
		return this._color.alpha;
	}
	get color(): OklchColor {
		return this._color;
	}
	get css(): string {
		return oklchCss(this._color);
	}
	get opaqueCss(): string {
		return oklchCss({ ...this._color, alpha: 1 });
	}

	setLc(l: number, c: number): void {
		this.apply(l, c, this._color.h, this._color.alpha);
	}
	setH(h: number): void {
		this.apply(this._color.l, this._color.c, h, this._color.alpha);
	}
	setAlpha(alpha: number): void {
		this.apply(this._color.l, this._color.c, this._color.h, alpha);
	}
	setColor(color: OklchColor): void {
		this.apply(color.l, color.c, color.h, color.alpha);
	}

	private apply(
		l: number,
		c: number,
		h: number,
		alpha: number,
	): void {
		this._color = { l, c: chromaInGamut(l, c, h), h, alpha };
		const target = this.binding.resolve([this.key]);
		if (target) {
			target.container[target.key] = oklchCss(this._color);
		}
		this.notify();
	}

	commit(): void {
		const after = oklchCss(this._color);
		if (after === this.baseline) {
			return;
		}
		const before = this.baseline;
		this.baseline = after;
		this.binding.record([this.key], before, after);
	}

	// Re-seed from an external change (undo/redo, or a different value).
	reset(value: string): void {
		this.baseline = value;
		this._color = toOklch(value);
		this.notify();
	}
}

export const ColorField = ({
	value,
	binding,
}: Readonly<{
	value: string;
	binding: FieldBinding;
}>) => {
	const [open, setOpen] = useState(false);
	const [model] = useState(
		() => new FieldColorModel(binding, "css", value),
	);
	useSyncExternalStore(
		(listener) => model.subscribe(listener),
		() => model.css,
	);
	useEffect(() => {
		if (value !== model.css) {
			model.reset(value);
		}
	}, [value, model]);
	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<OklchField
				model={model}
				leftSlot={
					<Popover.Trigger
						className={styles.swatchButton}
						aria-label="Edit colour"
						style={{ background: swatchBackground(model.css) }}
					/>
				}
			/>
			<Popover.Portal>
				<Popover.Positioner sideOffset={8} align="start">
					<Popover.Popup
						className={clsx(surface.surface, styles.colorPanel)}
					>
						<ColorPanel model={model} />
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
};

export default ColorField;
