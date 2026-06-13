import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { useSyncExternalStore } from "react";
import Tooltip from "../tooltip";
import controls from "../styles/controls.module.scss";
import type {
	SpriteEditorState,
	SpriteTool,
} from "./sprite-editor-state";
import { SPRITE_TOOLS } from "./sprite-tools";

const ToolPanel = ({
	state,
}: Readonly<{ state: SpriteEditorState }>) => {
	const tool = useSyncExternalStore(
		state.subscribe,
		() => state.tool,
	);

	return (
		<ToggleGroup
			value={[tool]}
			onValueChange={(value) => {
				if (value.length > 0) {
					state.setTool(value[0] as SpriteTool);
				}
			}}
			className={controls.toggleGroup}
		>
			{SPRITE_TOOLS.map((def) => (
				<Tooltip
					key={def.id}
					label={def.label}
					shortcut={def.shortcut.toUpperCase()}
				>
					<Toggle value={def.id} className={controls.iconButton}>
						<def.icon weight={tool === def.id ? "fill" : undefined} />
					</Toggle>
				</Tooltip>
			))}
		</ToggleGroup>
	);
};

export default ToolPanel;
