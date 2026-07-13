export type GamepadFamily =
	| "xbox"
	| "playstation"
	| "switch"
	| "generic";

const XBOX_NEEDLES = ["xbox", "xinput", "045e"];
const PLAYSTATION_NEEDLES = [
	"dualsense",
	"dualshock",
	"sony",
	"054c",
	"0ce6",
	"09cc",
];
const SWITCH_NEEDLES = [
	"switch",
	"pro controller",
	"nintendo",
	"joy-con",
	"057e",
];

const matches = (haystack: string, needles: string[]): boolean =>
	needles.some((needle) => haystack.includes(needle));

export const detectGamepadType = (
	id: string,
	mapping: string,
): GamepadFamily => {
	const haystack = `${id} ${mapping}`.toLowerCase();
	if (matches(haystack, PLAYSTATION_NEEDLES)) {
		return "playstation";
	}
	if (matches(haystack, SWITCH_NEEDLES)) {
		return "switch";
	}
	if (matches(haystack, XBOX_NEEDLES)) {
		return "xbox";
	}
	return "generic";
};
