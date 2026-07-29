import { Popover } from "@base-ui/react/popover";
import { Slider } from "@base-ui/react/slider";
import { CloudRainIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { climatePresets } from "../../engine/weather/climate-registry";
import Button from "../button";
import { Field } from "../inspector/field";
import { Checkbox, EnumSelect } from "../inspector/inputs";
import surface from "../styles/surface.module.scss";
import Tooltip from "../tooltip";
import { useEditorValue } from "../use-editor";
import { usePortalContainer } from "../window/portal-container";
import styles from "./weather-preview-popover.module.scss";
import type { WeatherPreviewStore } from "./weather-preview-store";

/** Fine enough to hear and see a change, coarse enough to land on round values. */
const SCRUB_STEP = 0.01;

const SCRUB_FORMAT: Intl.NumberFormatOptions = {
	style: "percent",
	maximumFractionDigits: 0,
};

const ScrubField = ({
	label,
	value,
	onChange,
}: Readonly<{
	label: string;
	value: number;
	onChange: (value: number) => void;
}>) => (
	<Field.Root>
		<Field.Label>{label}</Field.Label>
		<Slider.Root
			value={value}
			min={0}
			max={1}
			step={SCRUB_STEP}
			format={SCRUB_FORMAT}
			onValueChange={(next) => onChange(next)}
		>
			<div className={styles.scrub}>
				<Slider.Control className={styles.control}>
					<Slider.Track className={styles.track}>
						<Slider.Indicator className={styles.indicator} />
						<Slider.Thumb className={styles.thumb} />
					</Slider.Track>
				</Slider.Control>
				<Slider.Value className={styles.value} />
			</div>
		</Slider.Root>
	</Field.Root>
);

/**
 * The scene view's weather preview: pick any preset in the catalog, scrub wind and
 * precipitation, mute the ambience.
 *
 * The picker deliberately offers the **whole** catalog rather than the presets the
 * scene's climate rolls. Authored dwell times are minutes long, so a session that
 * could only watch the scheduler would see no weather at all; every state has to be
 * one click away.
 *
 * Nothing here writes a component — see {@link WeatherPreviewStore}.
 */
const WeatherPreviewPopover = ({
	store,
}: Readonly<{ store: WeatherPreviewStore }>) => {
	const container = usePortalContainer();
	const state = useEditorValue(store, (s) => s.state);
	const muted = useEditorValue(store, (s) => s.muted);
	return (
		<Popover.Root>
			<Tooltip label="Weather preview">
				<Popover.Trigger
					render={
						<Button variant="icon">
							<CloudRainIcon />
						</Button>
					}
				/>
			</Tooltip>
			<Popover.Portal container={container}>
				<Popover.Positioner sideOffset={8}>
					<Popover.Popup
						className={clsx(surface.surface, styles.popup)}
					>
						{state === null ? (
							<p className={styles.empty}>
								No climate catalog is registered, so this scene has no
								weather to preview.
							</p>
						) : (
							<>
								<Field.Root>
									<Field.Label>Preset</Field.Label>
									<EnumSelect
										value={state.presetId}
										options={climatePresets().map(
											(preset) => preset.id,
										)}
										onCommit={(v) => store.setPreset(String(v))}
									/>
								</Field.Root>
								<ScrubField
									label="Wind"
									value={state.wind}
									onChange={(wind) => store.setWind(wind)}
								/>
								<ScrubField
									label="Precipitation"
									value={state.precipitation}
									onChange={(rain) => store.setPrecipitation(rain)}
								/>
								<Field.Root>
									<Checkbox
										checked={muted}
										onCheckedChange={(checked) =>
											store.setMuted(checked)
										}
									/>
									<Field.Label>Mute weather audio</Field.Label>
								</Field.Root>
								<Button
									variant="secondary"
									onClick={() => store.reset()}
								>
									Reset to climate default
								</Button>
							</>
						)}
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
};

export default WeatherPreviewPopover;
