type ModifierAlias = Readonly<{ side: string; general: string }>;

const MODIFIERS: Readonly<Record<string, ModifierAlias>> = {
	ShiftLeft: { side: "SHIFT_LEFT", general: "SHIFT" },
	ShiftRight: { side: "SHIFT_RIGHT", general: "SHIFT" },
	ControlLeft: { side: "CTRL_LEFT", general: "CTRL" },
	ControlRight: { side: "CTRL_RIGHT", general: "CTRL" },
	AltLeft: { side: "ALT_LEFT", general: "ALT" },
	AltRight: { side: "ALT_RIGHT", general: "ALT" },
	MetaLeft: { side: "META_LEFT", general: "META" },
	MetaRight: { side: "META_RIGHT", general: "META" },
};

/**
 * Normalizes a physical `KeyboardEvent.code` into the friendly map keys it sets.
 * Letters/digits drop their `Key`/`Digit` prefix; symmetric modifiers emit both
 * a side-specific key and a general alias (so `SHIFT` is true while either Shift
 * is held); everything else is the uppercased code (`Space` → `SPACE`).
 */
const codeToNames = (code: string): string[] => {
	const modifier = MODIFIERS[code];
	if (modifier) {
		return [modifier.side, modifier.general];
	}
	const letter = /^Key([A-Z])$/.exec(code);
	if (letter) {
		return [letter[1]!];
	}
	const digit = /^Digit([0-9])$/.exec(code);
	if (digit) {
		return [digit[1]!];
	}
	return [code.toUpperCase()];
};

/**
 * Immediate-mode keyboard state keyed by normalized physical key names (see
 * `codeToNames`). A key is present and `true` while held, absent once released.
 * Rebuilt from the live set of pressed codes on every event, so a general
 * modifier alias stays true as long as either side is down.
 */
export class Keyboard {
	readonly keys: Record<string, boolean> = {};

	private target: HTMLElement;
	private pressed = new Set<string>();

	constructor(target: HTMLElement) {
		this.target = target;
		target.addEventListener("keydown", this.onKeyDown);
		target.addEventListener("keyup", this.onKeyUp);
		target.addEventListener("blur", this.onBlur);
	}

	dispose(): void {
		this.target.removeEventListener("keydown", this.onKeyDown);
		this.target.removeEventListener("keyup", this.onKeyUp);
		this.target.removeEventListener("blur", this.onBlur);
	}

	private onKeyDown = (e: KeyboardEvent): void => {
		this.pressed.add(e.code);
		this.rebuild();
	};

	private onKeyUp = (e: KeyboardEvent): void => {
		this.pressed.delete(e.code);
		this.rebuild();
	};

	private onBlur = (): void => {
		this.pressed.clear();
		this.rebuild();
	};

	private rebuild(): void {
		for (const key of Object.keys(this.keys)) {
			delete this.keys[key];
		}
		for (const code of this.pressed) {
			for (const name of codeToNames(code)) {
				this.keys[name] = true;
			}
		}
	}
}
