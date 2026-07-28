import { Duration, type Seconds } from "../../engine/duration";
import type { ECS, EntityId } from "../../engine/ecs";
import type EventBus from "../../engine/events";
import { stepMachine } from "../../engine/fsm/step-machine";
import { PerceptionComponent } from "../../engine/perception/perception-component";
import { profiler } from "../../engine/profiling/profiler";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { CharacterComponent } from "../character/character-component";
import { characterById } from "../character/character-descriptor";
import type { CharacterId } from "../character/character-ids";
import { standingTowardPlayer } from "../character/reputation";
import type { StandingId } from "../character/standing-ids";
import { BarkComponent } from "../dialogue/bark-component";
import { knotText } from "../dialogue/knot-text";
import { getReaction } from "../faction/reaction";
import { isEngaging } from "./engagement";
import { reactionDef, reactionsFor } from "./loader";
import { ReactionComponent } from "./reaction-component";
import type { ReactionDef } from "./reaction-def";
import type { ReactionId, StimulusId } from "./reaction-ids";
import { reactionLifecycleMachine } from "./reaction-lifecycle-def";

/**
 * Turns perception into reactions: reads this frame's stimuli, picks the
 * highest-priority reaction off the actor's authored table that its standing
 * admits and whose cooldown has expired, drives the display lifecycle and
 * performs its side effects.
 *
 * Runs after `PerceptionSystem` so the notice deltas and damage timer it reads
 * are this frame's.
 */
@profiler("Reactions", "AI")
export class ReactionSystem extends UpdateSystem {
	update({ dt, ecs, events }: UpdateContext): void {
		const s = dt / 1000;
		for (const [id, reaction, perception] of ecs.query(
			ReactionComponent,
			PerceptionComponent,
		)) {
			this.tickCooldowns(reaction, s);

			const character = this.characterOf(ecs, id);
			const engaged = this.recordEngaged(
				ecs,
				id,
				reaction,
				perception,
			);
			const idle = reaction.machine.current === "idle";
			const picked = idle
				? this.pick(
						ecs,
						id,
						reaction,
						perception,
						engaged,
						standingTowardPlayer(character),
					)
				: null;
			const playing = reaction.current
				? reactionDef(reaction.current)
				: null;

			const result = stepMachine(
				reactionLifecycleMachine,
				reaction.machine,
				{
					requested: picked !== null,
					enter: playing?.enter ?? 0,
					hold: playing?.hold ?? 0,
					exit: playing?.exit ?? 0,
				},
				s as Seconds,
			);

			if (result.entered.includes("reacting") && picked) {
				this.begin(ecs, events, id, reaction, picked, character);
			}
			if (result.exited.includes("reacting")) {
				reaction.current = null;
				reaction.emotion = null;
			}
		}
	}

	private tickCooldowns(
		reaction: ReactionComponent,
		s: number,
	): void {
		for (const id of Object.keys(
			reaction.sinceFired,
		) as ReactionId[]) {
			reaction.sinceFired[id] = (reaction.sinceFired[id] ?? 0) + s;
		}
	}

	/**
	 * Which character this actor is — the link every per-character answer hangs
	 * off, its reputation standing and its typeface both.
	 *
	 * A reacting entity without a {@link CharacterComponent} is a content bug with
	 * no sensible fallback — guessing a standing is how every NPC ended up equally
	 * chummy — so it crashes here rather than picking one.
	 */
	private characterOf(ecs: ECS, id: EntityId): CharacterId {
		const character = ecs.getComponent(id, CharacterComponent);
		if (!character) {
			throw new Error(
				`Entity ${id} has a Reaction but no Character, so no reputation standing can be resolved. Add a Character component naming which CharacterId it is.`,
			);
		}
		return character.character;
	}

	/**
	 * Swap in the set of noticed entities currently engaging this actor and report
	 * who just joined it.
	 *
	 * This edge — not the notice edge — is what a greeting keys on. Being seen and
	 * turning up to say hello are different moments, and now that awareness is
	 * sticky they are usually different moments in time too: the player is often
	 * noticed while walking away, and would then never be greeted no matter how
	 * deliberately they came back.
	 */
	private recordEngaged(
		ecs: ECS,
		id: EntityId,
		reaction: ReactionComponent,
		perception: PerceptionComponent,
	): readonly EntityId[] {
		const engaged = perception.noticed.filter(
			(other) =>
				getReaction(ecs, id, other) !== "hostile" &&
				isEngaging(ecs, id, other),
		);
		const arrived = engaged.filter(
			(other) => !reaction.engaged.includes(other),
		);
		reaction.engaged = engaged;
		return arrived;
	}

	/**
	 * What happened to this actor this frame.
	 *
	 * `noticed-friendly` covers every non-hostile stance, not just an explicit
	 * `"friendly"` one: `getReaction` reads `"neutral"` for any pair the faction
	 * table leaves out, and the table only lists departures from indifference — so
	 * a stricter reading would leave an NPC noticing the player with no stimulus at
	 * all.
	 *
	 * `noticed-hostile` keys off the notice edge instead: an enemy shouts whether or
	 * not you were looking at it.
	 */
	private stimuli(
		ecs: ECS,
		id: EntityId,
		perception: PerceptionComponent,
		engaged: readonly EntityId[],
	): Set<StimulusId> {
		const out = new Set<StimulusId>();
		const hostile = perception.noticedEntered.some(
			(noticed) => getReaction(ecs, id, noticed) === "hostile",
		);
		if (hostile) {
			out.add("noticed-hostile");
		}
		if (engaged.length > 0) {
			out.add("noticed-friendly");
		}
		if (perception.noticedExited.length > 0) {
			out.add("lost-sight");
		}
		if (perception.timeSinceDamage === 0) {
			out.add("took-damage");
		}
		return out;
	}

	private pick(
		ecs: ECS,
		id: EntityId,
		reaction: ReactionComponent,
		perception: PerceptionComponent,
		engaged: readonly EntityId[],
		standing: StandingId,
	): ReactionDef | null {
		const stimuli = this.stimuli(ecs, id, perception, engaged);
		if (stimuli.size === 0) {
			return null;
		}
		let best: ReactionDef | null = null;
		for (const def of reactionsFor(reaction.table)) {
			if (!stimuli.has(def.stimulus)) {
				continue;
			}
			if (!def.standings.includes(standing)) {
				continue;
			}
			const since = reaction.sinceFired[def.id];
			if (since !== undefined && (def.once || since < def.cooldown)) {
				continue;
			}
			if (!best || def.priority > best.priority) {
				best = def;
			}
		}
		return best;
	}

	/**
	 * Starts a reaction: run-state, then its overhead line typeset in the speaker's
	 * own font off their `CharacterDescriptor` — the same source a conversation
	 * bubble reads, so an overhead line and a spoken line look like one voice.
	 */
	private begin(
		ecs: ECS,
		events: EventBus,
		id: EntityId,
		reaction: ReactionComponent,
		def: ReactionDef,
		character: CharacterId,
	): void {
		reaction.current = def.id;
		reaction.emotion = def.emotion;
		reaction.sinceFired[def.id] = 0;
		const text = knotText(ecs, events, def.bark);
		if (text !== null && text.length > 0) {
			ecs.addComponent(
				id,
				new BarkComponent(
					text,
					new Duration(def.hold),
					undefined,
					characterById(character).font,
				),
			);
		}
	}
}
