export type DamageStats = {
	base: number;
	critChance: number;
	critMultiplier: number;
};

export type HitModifiers = {
	critChanceBonus: number;
	critMultiplierBonus: number;
	damageScale: number;
};

export const NO_MODIFIERS: HitModifiers = {
	critChanceBonus: 0,
	critMultiplierBonus: 0,
	damageScale: 1,
};

export const resolveHit = (
	stats: DamageStats,
	mods: HitModifiers,
	rng: () => number = Math.random,
): { amount: number; crit: boolean } => {
	const chance = Math.min(
		1,
		Math.max(0, stats.critChance + mods.critChanceBonus),
	);
	const crit = rng() < chance;
	const multiplier = stats.critMultiplier + mods.critMultiplierBonus;
	const amount =
		stats.base * (crit ? multiplier : 1) * mods.damageScale;
	return { amount, crit };
};
