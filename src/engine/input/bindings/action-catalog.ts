export type ActionKind = "discrete" | "continuous";

export type ActionDef = Readonly<{
	id: string;
	kind: ActionKind;
	essential: boolean;
}>;

export type Tokens = Readonly<{ kind: "tokens"; tokens: string[] }>;
export type Chord = Readonly<{ kind: "chord"; tokens: string[] }>;
export type Ref = Readonly<{ kind: "ref"; action: string }>;
export type Source = Tokens | Chord | Ref;

export type DiscreteActivation = "press" | "hold" | "doubleTap";
export type ContinuousActivation = "whileHeld" | "toggle";
export type Activation = DiscreteActivation | ContinuousActivation;

export type Binding = Readonly<{
	action: string;
	source: Source;
	activation: Activation;
}>;

export type CoexistPair = Readonly<{ a: string; b: string }>;

export type ActionCatalog = Readonly<{
	actions: ActionDef[];
	contexts: string[];
	defaults: Binding[];
	coexist: CoexistPair[];
}>;
