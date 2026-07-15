import type { OpNode, OpParams } from "./op";

export type SequenceClass = "exclusive" | "ambient";

export type CastResolverRef = Readonly<{
	resolver: string;
	params?: OpParams;
}>;

export type Cast = Readonly<{ [role: string]: CastResolverRef }>;

export type SequenceDef = Readonly<{
	id: string;
	class: SequenceClass;
	cast: Cast;
	root: OpNode;
}>;
