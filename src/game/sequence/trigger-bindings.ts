import type { TriggerVolumeBindings } from "../../engine/trigger/trigger-volume-system";
import { ChronicleComponent } from "../chronicle/chronicle-component";

export const chronicleTriggerBindings: TriggerVolumeBindings = {
	flagActive: ({ ecs }, flag) => {
		const value = ecs.query(ChronicleComponent)[0]?.[1].get(flag);
		return value !== undefined && value !== "" && value !== "none";
	},
};
