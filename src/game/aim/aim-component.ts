import { AimAngle } from "../../engine/input/aim/aim-angle";
import { serializable } from "../../engine/serialization/serializable";

@serializable("Aim")
export class AimComponent {
	readonly aim: AimAngle = new AimAngle();
}
