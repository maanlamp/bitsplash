import { serializable } from "../../engine/serialization/serializable";

/**
 * Marks an entity as an ordinary NPC — a talker and a reactor, never a combatant.
 *
 * Six prefabs already declared `"NpcTag": {}` while nothing registered the name,
 * and `deserialize` drops unknown components under its `"skip"` policy, so
 * registering it changes no committed artifact: `demo.scene.json` holds its NPCs
 * as `SpawnPoint` entities and contains no `NpcTag` of its own.
 */
@serializable("NpcTag")
export class NpcTagComponent {}
