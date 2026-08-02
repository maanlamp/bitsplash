import {
	ThunderBank as Takes,
	THUNDER_TAKE_URLS,
} from "../content/assets/assets.gen";
import type { ThunderTakeId } from "./thunder-take-id";

/**
 * The thunder bank: eleven recordings, what each one is for, and where the
 * strike sits inside it.
 *
 * **Thunder is sampled, not synthesised.** Two spikes were built and rejected
 * during planning — a physically-motivated multi-source model and a faithful
 * rebuild of the best-rated published one — because the published listening test
 * (50+ participants) found even the best synthesised model plainly
 * distinguishable from a recording. Sub-bass synthesis under a recorded crack
 * was tried too, and reads as two stacked things rather than one event. Distance
 * drives filtering and level; the recordings stay recordings.
 *
 * A take is reached through the generated {@link Takes} accessor, never as a
 * bare string, so a renamed `.wav` fails at codegen and at `tsc` instead of
 * going quietly silent mid-storm.
 *
 * Licence: Sonniss GDC bundle — royalty-free, commercial use, unlimited
 * projects, no attribution required, no AI/ML training use.
 */

/** The three layers a thunderclap is built from. */
const THUNDER_ROLES = ["close", "crack", "rumble"] as const;

export type ThunderRole = (typeof THUNDER_ROLES)[number];

/** One recording, with the band it is eligible for and its usable strikes. */
export type ThunderTake = Readonly<{
	id: ThunderTakeId;
	url: string;
	role: ThunderRole;
	/**
	 * Seconds into the take where a usable strike lands, measured during the
	 * audition. A take with two holds two strikes and one is picked per clap.
	 */
	strikes: readonly number[];
	/** Closest distance in metres this take suits. */
	minMetres: number;
	/** Furthest distance in metres this take suits. */
	maxMetres: number;
}>;

const url = (id: ThunderTakeId): string => {
	const found = THUNDER_TAKE_URLS[id];
	if (found === undefined) {
		throw new Error(
			`Thunder bank: no asset url for take "${id}". Run \`bun run gen\`.`,
		);
	}
	return found;
};

const take = (
	id: ThunderTakeId,
	role: ThunderRole,
	strikes: readonly number[],
	minMetres = 0,
	maxMetres = Number.POSITIVE_INFINITY,
): ThunderTake => ({
	id,
	url: url(id),
	role,
	strikes,
	minMetres,
	maxMetres,
});

/** Every banked take. The distance bands are the ones that passed audition. */
export const THUNDER_BANK: readonly ThunderTake[] = [
	take(Takes.closeStrike, "close", [0.75, 2.95]),
	take(Takes.closeCrack, "close", [0]),
	take(Takes.crackExtreme, "crack", [1.2], 0, 400),
	take(Takes.crackDry, "crack", [4.8, 11.95], 0, 3500),
	take(Takes.crackNear, "crack", [7.45], 0, 3000),
	take(Takes.crackBoom, "crack", [0], 0, 2500),
	take(Takes.crackClap, "crack", [0], 400),
	take(Takes.crackDistant, "crack", [1.75], 3000),
	take(Takes.crackMountain, "crack", [0], 2500),
	take(Takes.rumbleMid, "rumble", [0], 0, 2000),
	take(Takes.rumbleDeep, "rumble", [2]),
];

/** Every take in a role that suits a distance, in bank order. */
export const takesFor = (
	role: ThunderRole,
	metres: number,
): readonly ThunderTake[] =>
	THUNDER_BANK.filter(
		(entry) =>
			entry.role === role &&
			metres >= entry.minMetres &&
			metres <= entry.maxMetres,
	);
