import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { useSyncExternalStore } from "react";
import Tooltip from "../tooltip";
import controls from "../styles/controls.module.scss";
import type { SpriteEditorState } from "./sprite-editor-state";
import type { SpriteToolId } from "./sprite-tool-id";
import { TOOL_REGISTRY } from "./tool-registry";

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
					state.setTool(value[0] as SpriteToolId);
				}
			}}
			className={controls.toggleGroup}
		>
			{TOOL_REGISTRY.map((entry) => (
				<Tooltip
					key={entry.id}
					label={entry.label}
					shortcut={entry.shortcut.toUpperCase()}
				>
					<Toggle value={entry.id} className={controls.iconButton}>
						<entry.icon
							weight={tool === entry.id ? "fill" : undefined}
						/>
					</Toggle>
				</Tooltip>
			))}
		</ToggleGroup>
	);
};

export default ToolPanel;
