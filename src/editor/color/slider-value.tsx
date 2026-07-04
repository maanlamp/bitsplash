import NumberFlow, {
	continuous,
	type Format,
} from "@number-flow/react";

const token = (name: string): string =>
	getComputedStyle(document.documentElement)
		.getPropertyValue(name)
		.trim();

const durationMs = (value: string): number =>
	value.endsWith("ms") ? parseFloat(value) : parseFloat(value) * 1000;

let timing: EffectTiming | null = null;
const flowTiming = (): EffectTiming =>
	(timing ??= {
		duration: durationMs(token("--duration-fast")),
		easing: token("--ease-standard"),
	});

const SliderValue = ({
	value,
	format,
	suffix,
}: Readonly<{
	value: number;
	format?: Format;
	suffix?: string;
}>) => (
	<NumberFlow
		value={value}
		format={format}
		suffix={suffix}
		isolate
		willChange
		transformTiming={flowTiming()}
		spinTiming={flowTiming()}
		opacityTiming={flowTiming()}
		plugins={[continuous]}
	/>
);

export default SliderValue;
