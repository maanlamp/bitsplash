import { isEmotionId } from "../character/emotion-ids";
import {
	isStandingId,
	type StandingId,
} from "../character/standing-ids";
import { Reactions } from "../content/dialogue/knots.gen";
import enemyTable from "../content/reactions/enemy.json";
import npcTable from "../content/reactions/npc.json";
import type { ReactionDef } from "./reaction-def";
import {
	isReactionId,
	isStimulusId,
	type ReactionId,
} from "./reaction-ids";
import {
	REACTION_TABLE_IDS,
	type ReactionTableId,
} from "./reaction-table-ids";

/** One authored row, before the loader attaches its derived bark knot. */
type AuthoredReaction = Readonly<{
	id: string;
	stimulus: string;
	emotion: string;
	standings: readonly string[];
	priority: number;
	cooldown: number;
	once: boolean;
	enter: number;
	hold: number;
	exit: number;
}>;

type AuthoredTable = Readonly<{
	table: string;
	reactions: readonly AuthoredReaction[];
}>;

/**
 * Every table, keyed by id. Static imports rather than `import.meta.glob`: the
 * key type is {@link ReactionTableId}, so a new member of `REACTION_TABLE_IDS`
 * without a matching file is a `tsc` error, and the tables load identically under
 * Vite and under `bun test` (where `import.meta.glob` throws).
 */
const TABLES: Readonly<Record<ReactionTableId, AuthoredTable>> = {
	npc: npcTable,
	enemy: enemyTable,
};

const invalid = (table: string, message: string): Error =>
	new Error(`src/game/content/reactions/${table}.json: ${message}`);

/**
 * A row with no standings could never fire, which is a silent way to lose a
 * reaction — so an empty list is a load failure, and "standing must not gate
 * this" is authored by listing every standing instead.
 */
const standings = (
	table: ReactionTableId,
	id: ReactionId,
	authored: readonly string[],
): readonly StandingId[] => {
	if (authored.length === 0) {
		throw invalid(
			table,
			`reaction "${id}" lists no standings, so it can never fire. List every standing if standing must not gate it.`,
		);
	}
	return authored.map((value) => {
		if (!isStandingId(value)) {
			throw invalid(
				table,
				`reaction "${id}" names unknown standing "${value}".`,
			);
		}
		return value;
	});
};

const validate = (
	table: ReactionTableId,
	row: AuthoredReaction,
	seen: Set<string>,
): ReactionDef => {
	const id = row.id;
	if (!isReactionId(id)) {
		throw invalid(table, `"${id}" is not a known reaction id.`);
	}
	if (seen.has(id)) {
		throw invalid(table, `reaction "${id}" is listed twice.`);
	}
	seen.add(id);
	const stimulus = row.stimulus;
	if (!isStimulusId(stimulus)) {
		throw invalid(
			table,
			`reaction "${id}" keys off unknown stimulus "${stimulus}".`,
		);
	}
	const emotion = row.emotion;
	if (!isEmotionId(emotion)) {
		throw invalid(
			table,
			`reaction "${id}" names unknown emotion "${emotion}".`,
		);
	}
	const bark = Reactions.line[id];
	if (!bark) {
		throw invalid(
			table,
			`reaction "${id}" has no generated bark knot.`,
		);
	}
	return {
		id,
		stimulus,
		emotion,
		standings: standings(table, id, row.standings),
		priority: row.priority,
		cooldown: row.cooldown,
		once: row.once,
		enter: row.enter,
		hold: row.hold,
		exit: row.exit,
		bark,
	};
};

const byTable = new Map<ReactionTableId, readonly ReactionDef[]>();
const byId = new Map<ReactionId, ReactionDef>();

for (const table of REACTION_TABLE_IDS) {
	const authored = TABLES[table];
	if (authored.table !== table) {
		throw invalid(
			table,
			`declares table id "${authored.table}" but is registered as "${table}".`,
		);
	}
	const seen = new Set<string>();
	const defs = authored.reactions.map((row) =>
		validate(table, row, seen),
	);
	byTable.set(table, defs);
	for (const def of defs) {
		byId.set(def.id, def);
	}
}

/**
 * Every reaction the given table may perform, in authored order.
 *
 * @example
 * for (const def of reactionsFor(reaction.table)) { … }
 */
export const reactionsFor = (
	table: ReactionTableId,
): readonly ReactionDef[] => byTable.get(table) ?? [];

/**
 * The definition behind a reaction id.
 *
 * Unlike `getQuest`, a miss is a hard failure: a reaction id only ever comes from
 * `ReactionComponent.current`, which the arbitration system wrote from a loaded
 * table, so an absent def means the tables and the id tuple have diverged.
 */
export const reactionDef = (id: ReactionId): ReactionDef => {
	const def = byId.get(id);
	if (!def) {
		throw new Error(
			`Reaction "${id}" is in REACTION_IDS but no table lists it. Add a row under src/game/content/reactions/.`,
		);
	}
	return def;
};
