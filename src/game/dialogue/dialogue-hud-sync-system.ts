import { DialogueComponent } from "../../engine/dialogue/dialogue-component";
import { nineSliceInsets } from "../../engine/png-metadata";
import type { NineSliceInsets } from "../../engine/render/nine-slice";
import type { RichLine } from "../../engine/text/rich-text";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import type { LastUsedDevice } from "../../engine/input/last-used-device";
import { InteractionStateComponent } from "../interaction/interaction-state-component";
import { ACTION_IDS } from "../input/action-ids";
import { resolveHint } from "../ui/input-glyph-resolver";
import { resolveKbdFrame } from "../ui/kbd-frame";
import { DialoguePanelComponent } from "./dialogue-panel-component";
import type { DialogueHudState } from "./dialogue-hud-state";
import { UI_FONT } from "./dialogue-ui";
import { profiler } from "../../engine/profiling/profiler";

const FALLBACK_INSETS: NineSliceInsets = {
	left: 6,
	right: 6,
	top: 6,
	bottom: 7,
	gap: 2,
};

const EMPTY_LINES: readonly RichLine[] = [];

@profiler("Dialogue HUD sync", "HUD")
export class DialogueHudSyncSystem implements UpdateSystem {
	constructor(
		private readonly hud: DialogueHudState,
		private readonly lastUsed: LastUsedDevice,
	) {}

	update({ ecs, assetManager, actions, input }: UpdateContext): void {
		const entry = ecs.query(DialogueComponent)[0];
		if (!entry) {
			this.hud.close();
			return;
		}
		const [id, state] = entry;
		this.hud.setComponent(state);

		const panelUrl =
			ecs.getComponent(id, DialoguePanelComponent)?.panel ?? "";
		const lastPage = state.pageIndex >= state.pages.length - 1;
		const showChoices = state.complete && lastPage;
		const insets =
			nineSliceInsets(
				assetManager.getImageMetadata(panelUrl) || null,
			) ?? FALLBACK_INSETS;
		const fallbackGlyph =
			ecs.query(InteractionStateComponent)[0]?.[1].interactGlyph ??
			"E";
		const hint = resolveHint(
			assetManager,
			actions.getExpansion(),
			this.lastUsed.active,
			input,
			ACTION_IDS.dialogueAdvance,
		);

		const kbd = resolveKbdFrame(assetManager);
		this.hud.setSnapshot({
			open: true,
			speaker: state.speaker,
			glyphs: state.pages[state.pageIndex] ?? EMPTY_LINES,
			choices: showChoices ? state.choices : [],
			selectedOption: state.selectedOption,
			more: state.complete && !lastPage,
			advanceGlyph: hint.glyph ?? fallbackGlyph,
			advanceIcon: hint.icon,
			advanceActivation: hint.activation ?? "press",
			panel: assetManager.getImage(panelUrl) || null,
			insets,
			kbdFrame: kbd.image,
			kbdInsets: kbd.insets,
			bodyFont: state.font,
			uiFont: UI_FONT,
		});
	}
}
