/**
 * The VFX render-slot allocation: every `(layer, order)` pair effects may draw
 * into, and what each one is for.
 *
 * Every distinct slot owns a full-viewport render target — one clear, one
 * full-screen blit, and `width * height * 4` bytes of VRAM every frame — so the
 * budget is small and spending it is a decision, not an accident. Rather than
 * counting slots after the fact, the allocation is **named here and validated
 * against**: a def drawing anywhere else fails at catalog load with this table in
 * the message, so a fifth claimant argues its case at review instead of quietly
 * costing a render target.
 *
 * The table is the type-safe cross-reference for slots, following the same rule
 * as climate and effect ids: a slot is reached through {@link VFX_RENDER_SLOTS},
 * never as a bare `(layer, order)` a call site made up.
 *
 * **The allocation is full: 4 of 4.** If blood or fire needs a fifth, the options
 * are sharing an existing slot and relying on submission order within it, or
 * raising the budget with a *measured* VRAM and fill cost in hand. Do not raise
 * it speculatively.
 */

/** One allocated slot: where it draws, and what is allowed to draw there. */
export type VfxRenderSlot = Readonly<{
	/** Render layer id, resolved against the scene's authored layer list. */
	layer: string;
	/** Sort order within the layer. */
	order: number;
	/** What this slot exists for, quoted back in the failure message. */
	contents: string;
}>;

export const VFX_RENDER_SLOTS = [
	{
		layer: "overlay",
		order: 0,
		contents: "rain, splash, leaves, snow, sand",
	},
	{ layer: "overlay", order: 1, contents: "wind-line ribbons" },
	{
		layer: "overlay",
		order: 2,
		contents: "lightning bolt and its additive glow",
	},
	{ layer: "entities", order: 0, contents: "loot beam, helix" },
] as const satisfies ReadonlyArray<VfxRenderSlot>;

/**
 * Ceiling on the number of distinct `(layer, order)` slots a whole catalog may
 * draw into — derived from the allocation rather than declared beside it, so the
 * two cannot drift apart.
 */
export const VFX_MAX_RENDER_SLOTS = VFX_RENDER_SLOTS.length;

/** Whether a `(layer, order)` pair is one of the allocated slots. */
export const isAllocatedVfxSlot = (
	layer: string,
	order: number,
): boolean =>
	VFX_RENDER_SLOTS.some(
		(slot) => slot.layer === layer && slot.order === order,
	);

/** The allocation, one slot per line, for a failure message. */
export const describeVfxRenderSlots = (): string =>
	VFX_RENDER_SLOTS.map(
		(slot) => `${slot.layer}#${slot.order} (${slot.contents})`,
	).join(", ");
