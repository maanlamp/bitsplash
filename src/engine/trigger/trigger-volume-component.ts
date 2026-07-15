import {
	serializable,
	serialize,
} from "../serialization/serializable";

@serializable("TriggerVolume")
export class TriggerVolumeComponent {
	@serialize({ group: "flags" }) repeat: boolean;
	@serialize({ group: "flags" }) consumed: boolean;
	@serialize() targetId: string;
	@serialize() requiredFlag: string;

	constructor(
		targetId: string = "",
		repeat: boolean = false,
		requiredFlag: string = "",
		consumed: boolean = false,
	) {
		this.targetId = targetId;
		this.repeat = repeat;
		this.requiredFlag = requiredFlag;
		this.consumed = consumed;
	}
}
