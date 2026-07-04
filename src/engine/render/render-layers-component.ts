import {
	serializable,
	serialize,
} from "../serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "../serialization/serializable-value";

@serializable("RenderLayerDef")
export class RenderLayerDef implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	@serialize() id = "";
	@serialize() name = "";
}

@serializable("RenderLayers")
export class RenderLayersComponent {
	@serialize() layers: RenderLayerDef[] = [];
}
