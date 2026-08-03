import type { EntityId, ReadonlyECS } from "../../engine/ecs";
import { serializable } from "../../engine/serialization/serializable";
import { HealthComponent } from "../health/health-component";

/**
 * Marks an entity as able to die: depleting its `HealthComponent` emits a
 * `DeathEvent`. Without it, health is a damage ledger and nothing more — the
 * entity bottoms out at zero hp and keeps standing, which is what a target
 * dummy wants.
 *
 * Mortality is opt-in rather than implied by health so that a damageable prop
 * cannot be destroyed by an accident of authoring. Anything that must still be
 * killable carries it beside its health.
 */
@serializable("Mortal")
export class MortalComponent {}

/**
 * Whether an entity has been killed: mortal, and out of health.
 *
 * The one definition of "dead" for anything that inspects another entity rather
 * than reacting to its `DeathEvent` — an enemy deciding its target is finished,
 * a sequence waiting on a room. Depleted health alone is not death now that
 * mortality is opt-in: a target dummy sits at zero hp indefinitely, and reading
 * that as a corpse makes enemies drop their guard against something still
 * standing.
 *
 * @example
 * targetDead: perception.targetId !== null && isDead(ecs, perception.targetId),
 */
export const isDead = (
	ecs: ReadonlyECS,
	entity: EntityId,
): boolean => {
	const health = ecs.getComponent(entity, HealthComponent);
	if (!health) {
		return true;
	}
	return (
		health.hp <= 0 &&
		ecs.getComponent(entity, MortalComponent) !== undefined
	);
};
