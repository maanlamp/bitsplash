export type Params = Record<string, number | boolean | string>;

// Code conditions: a plain predicate over the params blackboard.
// Used by AI and player movement state machines.
export type CodeCondition = (params: Params) => boolean;

// Data conditions: serializable descriptors evaluated by evaluateDataCondition.
// Used by animation state machines authored in the sprite editor.
export type ParamCondition = {
	param: string;
	op: ">" | "<" | ">=" | "<=" | "==" | "!=";
	value: number | boolean | string;
};

export type TriggerCondition = {
	trigger: string;
};

export type DataCondition = ParamCondition | TriggerCondition;

export const isTriggerCondition = (
	c: DataCondition,
): c is TriggerCondition => "trigger" in c;

export const evaluateDataCondition = (
	cond: DataCondition,
	params: Params,
): boolean => {
	if (isTriggerCondition(cond)) {
		return params[cond.trigger] === true;
	}

	const actual = params[cond.param];
	if (actual === undefined) {
		return false;
	}

	switch (cond.op) {
		case ">":
			return actual > cond.value;
		case "<":
			return actual < cond.value;
		case ">=":
			return actual >= cond.value;
		case "<=":
			return actual <= cond.value;
		case "==":
			return actual === cond.value;
		case "!=":
			return actual !== cond.value;
	}
};
