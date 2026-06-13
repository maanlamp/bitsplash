import { Subscribable } from "../subscribable";

export type AudioTool = "select" | "razor";

export class AudioEditorState extends Subscribable {
	private _tool: AudioTool = "select";
	private _selectedClipId: string | null = null;

	get tool(): AudioTool {
		return this._tool;
	}

	get selectedClipId(): string | null {
		return this._selectedClipId;
	}

	setTool(tool: AudioTool): void {
		if (tool !== this._tool) {
			this._tool = tool;
			this.notify();
		}
	}

	setSelectedClip(id: string | null): void {
		if (id !== this._selectedClipId) {
			this._selectedClipId = id;
			this.notify();
		}
	}

	reset(): void {
		this._selectedClipId = null;
		this.notify();
	}
}
