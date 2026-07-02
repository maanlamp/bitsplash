export type EffectHandle = Readonly<{
	done(): boolean;
	complete(): void;
}>;
