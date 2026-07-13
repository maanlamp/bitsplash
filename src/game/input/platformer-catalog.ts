import type {
	ActionCatalog,
	ActionDef,
	Binding,
} from "../../engine/input/bindings/action-catalog";
import { token } from "../../engine/input/edge-detector";
import { ACTION_IDS, CONTEXT_IDS } from "./action-ids";

const kbd = (key: string): string => token.keyboard(key);
const mouse = (button: string): string => token.mouse(button);
const pad = (button: string): string => token.gamepad(0, button);

const tokens = (...t: string[]): Binding["source"] => ({
	kind: "tokens",
	tokens: t,
});

const ref = (action: string): Binding["source"] => ({
	kind: "ref",
	action,
});

const actions: ActionDef[] = [
	{ id: ACTION_IDS.moveLeft, kind: "continuous", essential: true },
	{ id: ACTION_IDS.moveRight, kind: "continuous", essential: true },
	{ id: ACTION_IDS.moveUp, kind: "continuous", essential: true },
	{ id: ACTION_IDS.moveDown, kind: "continuous", essential: true },
	{ id: ACTION_IDS.jump, kind: "discrete", essential: false },
	{ id: ACTION_IDS.jumpHold, kind: "continuous", essential: false },
	{ id: ACTION_IDS.dash, kind: "continuous", essential: false },
	{ id: ACTION_IDS.interact, kind: "discrete", essential: false },
	{
		id: ACTION_IDS.attackPrimary,
		kind: "continuous",
		essential: false,
	},
	{
		id: ACTION_IDS.dialogueAdvance,
		kind: "discrete",
		essential: false,
	},
	{
		id: ACTION_IDS.dialogueFastForward,
		kind: "continuous",
		essential: false,
	},
	{
		id: ACTION_IDS.dialogueNavUp,
		kind: "discrete",
		essential: false,
	},
	{
		id: ACTION_IDS.dialogueNavDown,
		kind: "discrete",
		essential: false,
	},
	{
		id: ACTION_IDS.cutsceneSkip,
		kind: "continuous",
		essential: false,
	},
	{ id: ACTION_IDS.menuConfirm, kind: "discrete", essential: true },
	{ id: ACTION_IDS.menuCancel, kind: "discrete", essential: true },
	{ id: ACTION_IDS.menuUp, kind: "discrete", essential: false },
	{ id: ACTION_IDS.menuDown, kind: "discrete", essential: false },
	{ id: ACTION_IDS.menuLeft, kind: "discrete", essential: false },
	{ id: ACTION_IDS.menuRight, kind: "discrete", essential: false },
	{ id: ACTION_IDS.pause, kind: "discrete", essential: true },
];

const defaults: Binding[] = [
	{
		action: ACTION_IDS.moveLeft,
		source: tokens(kbd("A")),
		activation: "whileHeld",
	},
	{
		action: ACTION_IDS.moveRight,
		source: tokens(kbd("D")),
		activation: "whileHeld",
	},
	{
		action: ACTION_IDS.moveUp,
		source: tokens(kbd("W")),
		activation: "whileHeld",
	},
	{
		action: ACTION_IDS.moveDown,
		source: tokens(kbd("S")),
		activation: "whileHeld",
	},
	{
		action: ACTION_IDS.jump,
		source: tokens(kbd("SPACE")),
		activation: "press",
	},
	{
		action: ACTION_IDS.jumpHold,
		source: tokens(kbd("SPACE")),
		activation: "whileHeld",
	},
	{
		action: ACTION_IDS.dash,
		source: tokens(kbd("SHIFT")),
		activation: "whileHeld",
	},
	{
		action: ACTION_IDS.interact,
		source: tokens(kbd("E")),
		activation: "press",
	},
	{
		action: ACTION_IDS.attackPrimary,
		source: tokens(mouse("left")),
		activation: "whileHeld",
	},
	{
		action: ACTION_IDS.dialogueAdvance,
		source: ref(ACTION_IDS.interact),
		activation: "press",
	},
	{
		action: ACTION_IDS.dialogueFastForward,
		source: ref(ACTION_IDS.interact),
		activation: "whileHeld",
	},
	{
		action: ACTION_IDS.dialogueNavUp,
		source: tokens(kbd("W")),
		activation: "press",
	},
	{
		action: ACTION_IDS.dialogueNavUp,
		source: tokens(kbd("ARROWUP")),
		activation: "press",
	},
	{
		action: ACTION_IDS.dialogueNavDown,
		source: tokens(kbd("S")),
		activation: "press",
	},
	{
		action: ACTION_IDS.dialogueNavDown,
		source: tokens(kbd("ARROWDOWN")),
		activation: "press",
	},
	{
		action: ACTION_IDS.cutsceneSkip,
		source: ref(ACTION_IDS.interact),
		activation: "whileHeld",
	},
	{
		action: ACTION_IDS.menuConfirm,
		source: tokens(kbd("ENTER")),
		activation: "press",
	},
	{
		action: ACTION_IDS.menuConfirm,
		source: tokens(kbd("SPACE")),
		activation: "press",
	},
	{
		action: ACTION_IDS.menuConfirm,
		source: tokens(pad("south")),
		activation: "press",
	},
	{
		action: ACTION_IDS.menuCancel,
		source: tokens(kbd("ESCAPE")),
		activation: "press",
	},
	{
		action: ACTION_IDS.menuCancel,
		source: tokens(pad("east")),
		activation: "press",
	},
	{
		action: ACTION_IDS.menuUp,
		source: tokens(kbd("ARROWUP")),
		activation: "press",
	},
	{
		action: ACTION_IDS.menuUp,
		source: tokens(pad("dpadUp")),
		activation: "press",
	},
	{
		action: ACTION_IDS.menuDown,
		source: tokens(kbd("ARROWDOWN")),
		activation: "press",
	},
	{
		action: ACTION_IDS.menuDown,
		source: tokens(pad("dpadDown")),
		activation: "press",
	},
	{
		action: ACTION_IDS.menuLeft,
		source: tokens(kbd("ARROWLEFT")),
		activation: "press",
	},
	{
		action: ACTION_IDS.menuLeft,
		source: tokens(pad("dpadLeft")),
		activation: "press",
	},
	{
		action: ACTION_IDS.menuRight,
		source: tokens(kbd("ARROWRIGHT")),
		activation: "press",
	},
	{
		action: ACTION_IDS.menuRight,
		source: tokens(pad("dpadRight")),
		activation: "press",
	},
	{
		action: ACTION_IDS.pause,
		source: tokens(kbd("ESCAPE")),
		activation: "press",
	},
	{
		action: ACTION_IDS.jump,
		source: tokens(pad("south")),
		activation: "press",
	},
	{
		action: ACTION_IDS.jumpHold,
		source: tokens(pad("south")),
		activation: "whileHeld",
	},
	{
		action: ACTION_IDS.dash,
		source: tokens(pad("l1")),
		activation: "whileHeld",
	},
	{
		action: ACTION_IDS.interact,
		source: tokens(pad("north")),
		activation: "press",
	},
	{
		action: ACTION_IDS.interact,
		source: tokens(mouse("right")),
		activation: "press",
	},
	{
		action: ACTION_IDS.attackPrimary,
		source: tokens(pad("r2")),
		activation: "whileHeld",
	},
	{
		action: ACTION_IDS.dialogueNavUp,
		source: tokens(pad("dpadUp")),
		activation: "press",
	},
	{
		action: ACTION_IDS.dialogueNavDown,
		source: tokens(pad("dpadDown")),
		activation: "press",
	},
	{
		action: ACTION_IDS.pause,
		source: tokens(pad("start")),
		activation: "press",
	},
];

export const platformerCatalog: ActionCatalog = {
	actions,
	contexts: [
		CONTEXT_IDS.menu,
		CONTEXT_IDS.cutscene,
		CONTEXT_IDS.dialogue,
		CONTEXT_IDS.gameplay,
	],
	defaults,
	coexist: [],
};
