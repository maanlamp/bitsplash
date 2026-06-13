export type BlendMode = GlobalCompositeOperation;

export type BlendModeDef = Readonly<{
	value: BlendMode;
	label: string;
}>;

export const DEFAULT_BLEND: BlendMode = "source-over";

export const BLEND_MODES: ReadonlyArray<BlendModeDef> = [
	{ value: "source-over", label: "Normal" },
	{ value: "multiply", label: "Multiply" },
	{ value: "screen", label: "Screen" },
	{ value: "overlay", label: "Overlay" },
	{ value: "darken", label: "Darken" },
	{ value: "lighten", label: "Lighten" },
	{ value: "color-dodge", label: "Color dodge" },
	{ value: "color-burn", label: "Color burn" },
	{ value: "hard-light", label: "Hard light" },
	{ value: "soft-light", label: "Soft light" },
	{ value: "difference", label: "Difference" },
	{ value: "exclusion", label: "Exclusion" },
	{ value: "hue", label: "Hue" },
	{ value: "saturation", label: "Saturation" },
	{ value: "color", label: "Color" },
	{ value: "luminosity", label: "Luminosity" },
	{ value: "lighter", label: "Add" },
];

export const blendLabel = (value: BlendMode): string =>
	BLEND_MODES.find((mode) => mode.value === value)?.label ?? "Normal";
