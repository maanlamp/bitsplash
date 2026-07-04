import ColorPickerPopup from "../color/color-picker-popup";
import type { SpriteEditorState } from "./sprite-editor-state";

const ColorPicker = ({
	state,
}: Readonly<{ state: SpriteEditorState }>) => (
	<ColorPickerPopup model={state} />
);

export default ColorPicker;
