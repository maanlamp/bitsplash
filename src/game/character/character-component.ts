import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import { CHARACTER_IDS, type CharacterId } from "./character-ids";

/**
 * Which character an entity *is*.
 *
 * The missing half of speaker identity: ink lines already carry a
 * {@link CharacterId} in their `# speaker:` tag, but nothing tied a spawned
 * entity to one, so anything reading a speaker's descriptor off an entity — a
 * bark's typeface, a reputation standing — had to guess or duplicate the data.
 * This is the link; `characterById` and `standingTowardPlayer` both hang off it.
 *
 * Distinct from `DialogueSourceComponent`, which says which *knot* an entity
 * opens: one signpost can read out a line spoken by somebody else, and a
 * character with no conversation still has a name and a standing.
 *
 * @example
 * const character = ecs.getComponent(id, CharacterComponent);
 * const { font } = characterById(character.character);
 */
@serializable("Character")
export class CharacterComponent {
	@serialize({ options: CHARACTER_IDS, required: true })
	character: CharacterId;

	/**
	 * The default is a placeholder for the zero-argument reconstruction the
	 * deserializer performs before filling fields; authored content always names
	 * one explicitly.
	 */
	constructor(character: CharacterId = "stranger") {
		this.character = character;
	}
}
