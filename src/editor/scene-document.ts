import type { EntityId, ReadonlyECS } from "../engine/ecs";
import type { AuthoredScene } from "../engine/runtime/game-module";
import {
	type Scene,
	type SceneConfig,
	type SceneFile,
	toSceneConfig,
} from "../engine/scene/scene";
import { deserializeWorld } from "../engine/serialization/deserialize";
import type { SerializedWorld } from "../engine/serialization/registry";
import { serializeWorld } from "../engine/serialization/serialize";
import { World } from "../engine/world";
import type { SelectionSnapshot } from "./editor-state";
import { Journal } from "./journal";
import {
	applyEntry,
	compositeOf,
	entryTargets,
	type JournalEntry,
	type ReplayTarget,
} from "./journal-entry";
import { sceneFileFrom } from "./level-export";
import { Subscribable } from "./subscribable";

/**
 * A two-way binding to the scene's selection store, used to snapshot and
 * restore selection across an undo/redo cursor move (plan cross-cutting:
 * undo-reselect). Kept as plain callbacks so the document depends on no UI type.
 */
export type SelectionBinding = Readonly<{
	capture: () => SelectionSnapshot;
	restore: (snap: SelectionSnapshot) => void;
}>;

/**
 * The per-scene edit document. Owns the scene's **baseline** — the raw scene
 * file passed through the pure migration pipeline at open (never a live-world
 * capture) — and an append-only {@link Journal} of edits made since.
 *
 * The JSDoc here is a deliberate, user-approved exception to the no-comments
 * rule (plan D1): the baseline + journal + save-point contract is the one place
 * a future journal truncation or re-baseline must reason about, so it is
 * documented explicitly.
 *
 * A scene file is produced **only** by {@link save}: replaying the journal onto
 * the baseline in a throwaway scratch world and serializing that. No live world
 * is ever serialized into the written bytes. Commands read this document's
 * {@link projection} to build entries and inverses; the live-apply target
 * ({@link liveTarget}) is where those entries take effect — kept distinct so a
 * later step can point live-apply at a run world while inverses still read the
 * document's projection.
 */
export class SceneDocument extends Subscribable {
	private _baseline: SceneFile;
	readonly journal = new Journal();

	private runTarget: ReplayTarget | null = null;

	private selectionBinding: SelectionBinding | null = null;
	private readonly selUndo: SelectionSnapshot[] = [];
	private readonly selRedo: SelectionSnapshot[] = [];

	/**
	 * @param scene the live scene this document edits.
	 * @param baseline the migrated scene file the scene was opened from — the
	 *   output of the pure `SceneFile → SceneFile` migration pipeline.
	 */
	constructor(
		readonly scene: Scene,
		baseline: SceneFile,
	) {
		super();
		this._baseline = baseline;
	}

	/** The migrated scene file this document is measured against. */
	get baseline(): SceneFile {
		return this._baseline;
	}

	get dirty(): boolean {
		return this.journal.dirty;
	}

	get canUndo(): boolean {
		return this.journal.canUndo;
	}

	get canRedo(): boolean {
		return this.journal.canRedo;
	}

	/** The read source for building entries and inverses. */
	get projection(): ReadonlyECS {
		return this.scene.world.ecs;
	}

	/** The config read source for scene-config edits. */
	get config(): SceneConfig {
		return this.scene.config;
	}

	/**
	 * Bind a run world as the secondary live-apply target for this document
	 * (plan D5/D6). While bound, edits to document entities dual-apply — to the
	 * edit world (the authoritative projection, from which reads and inverses are
	 * always taken) and, best-effort, to the run world so the change is visible
	 * in the simulation; edits to runtime-spawned entities (present in the run
	 * world, absent from the document) route as **sim-pokes** that mutate the run
	 * world only and are never journaled. Only the active run scene's document is
	 * bound; a frozen scene's document journals to its edit world alone, so its
	 * edits take effect next run (D7).
	 */
	bindRun(target: ReplayTarget): void {
		this.runTarget = target;
	}

	/** Clear the run binding; edits return to journaling the edit world only. */
	unbindRun(): void {
		this.runTarget = null;
	}

	/**
	 * Bind the scene's selection store so undo/redo can restore the selection
	 * that was active at each cursor position (plan cross-cutting: undo-reselect).
	 * The document snapshots the selection before each journaled edit and, on an
	 * undo/redo move, restores the matching snapshot with ids the edit deleted
	 * filtered out.
	 */
	bindSelection(binding: SelectionBinding): void {
		this.selectionBinding = binding;
	}

	/**
	 * Whether `id` belongs to this document — i.e. exists in its authored
	 * projection. Membership is live document state (never a monotone id cache):
	 * a create-then-undo entity is correctly not a member.
	 */
	isMember(id: EntityId): boolean {
		return this.projection.entities().includes(id);
	}

	/**
	 * Whether `id` is a runtime-spawned entity during a run: present in the run
	 * world but not authored by this document. Only meaningful while a run world
	 * is bound; `false` otherwise.
	 */
	isRuntimeEntity(id: EntityId): boolean {
		return this.runTarget !== null && !this.isMember(id);
	}

	/**
	 * The command router chokepoint. Every edit surface flows through here.
	 * Classifies the entry by membership and either journals a document edit or
	 * sim-pokes a runtime entity.
	 */
	record(entry: JournalEntry): void {
		if (entry.kind === "composite") {
			this.recordComposite(entry);
			return;
		}
		if (this.isPoke(entry)) {
			this.pokeRun(entry);
			this.notify();
			return;
		}
		this.assertJournalable(entry);
		this.captureSelectionCursor();
		this.journal.record(entry, this.liveTarget());
		this.mirrorToRun(entry);
		this.notify();
	}

	/**
	 * Route a composite by its targets (plan F6). Its sub-entries are partitioned:
	 * ones targeting only runtime-spawned entities are poked live-only (discarded
	 * on stop), the rest are journaled together as one composite — a single undo
	 * step. An all-runtime composite journals nothing; an all-authored composite
	 * journals whole. This lets one keystroke touch authored and runtime entities
	 * without the whole entry hitting {@link assertJournalable} and throwing.
	 */
	private recordComposite(
		entry: JournalEntry & { kind: "composite" },
	): void {
		const poked: JournalEntry[] = [];
		const journaled: JournalEntry[] = [];
		for (const sub of entry.entries) {
			if (this.isRuntimeTargeted(sub)) {
				poked.push(sub);
			} else {
				journaled.push(sub);
			}
		}
		for (const sub of poked) {
			this.pokeRun(sub);
		}
		const authored = compositeOf(journaled);
		if (authored) {
			this.assertJournalable(authored);
			this.captureSelectionCursor();
			this.journal.record(authored, this.liveTarget());
			this.mirrorToRun(authored);
		}
		this.notify();
	}

	/**
	 * Append an entry whose live mutation the caller already performed (gesture
	 * previews such as a color-picker drag or a tile stroke).
	 */
	recordApplied(entry: JournalEntry): void {
		this.captureSelectionCursor();
		this.journal.recordApplied(entry);
		this.mirrorToRun(entry);
		this.notify();
	}

	undo(): void {
		const binding = this.selectionBinding;
		const current = binding ? binding.capture() : null;
		const inverse = this.journal.undo(this.liveTarget());
		this.mirrorToRun(inverse);
		if (binding && inverse) {
			const before = this.selUndo.pop();
			if (current) {
				this.selRedo.push(current);
			}
			if (before) {
				this.restoreSelectionSnapshot(binding, before);
			}
		}
		this.notify();
	}

	redo(): void {
		const binding = this.selectionBinding;
		const current = binding ? binding.capture() : null;
		const forward = this.journal.redo(this.liveTarget());
		this.mirrorToRun(forward);
		if (binding && forward) {
			const after = this.selRedo.pop();
			if (current) {
				this.selUndo.push(current);
			}
			if (after) {
				this.restoreSelectionSnapshot(binding, after);
			}
		}
		this.notify();
	}

	/**
	 * This document's current authored payload: the journal replayed onto the
	 * baseline in a disposed scratch world, serialized whole. Feeds
	 * a run's scene resolution so an open (possibly dirty) document plays instead
	 * of the committed file (plan D5) — the Model-B-clean way to run dirty
	 * documents without ever serializing a live or simulating world.
	 */
	toAuthoredScene(): AuthoredScene {
		const config = toSceneConfig(this._baseline.config);
		return {
			config,
			entities: this.replayAuthored(config),
			bounds: null,
		};
	}

	/**
	 * Produce the scene file to write: replay the journal onto the baseline in a
	 * disposed scratch world and serialize it whole. Runs the D3
	 * tripwires — a round-trip check (always) and, since this step only ever
	 * saves while idle, the replay-diff check against the live edit world — both
	 * of which hard-crash on a mismatch rather than write a corrupt file.
	 */
	save(): SceneFile {
		const config = toSceneConfig(this._baseline.config);
		const entities = this.replayAuthored(config);
		this.assertRoundTrips(entities, config);
		this.assertMatchesLive(entities);
		return sceneFileFrom(this.scene, entities, config);
	}

	/**
	 * Record that `file` (the exact output of {@link save} just written) is the
	 * new baseline, and advance the journal's save point.
	 */
	markSaved(file: SceneFile): void {
		this._baseline = file;
		this.journal.markSaved();
		this.notify();
	}

	revert(): void {
		this.restoreBaselineWorld();
		this.journal.reset();
		this.selUndo.length = 0;
		this.selRedo.length = 0;
		this.notify();
	}

	/**
	 * Rebuild the live edit world and config from the baseline and journal so
	 * they equal this document's projection. Called when a run ends: the run's
	 * simulation drifts and discards the live world, so idle editing and saves
	 * must resume from the authored projection, not stale simulation state.
	 */
	rebuildLive(): void {
		this.restoreBaselineWorld();
		this.journal.replayPending(this.liveTarget());
		this.notify();
	}

	/**
	 * Snapshot the current selection onto the undo cursor before a forward edit,
	 * discarding the redo cursor. The command may change the selection *after*
	 * recording (selecting a freshly-created entity, say); this captures the
	 * pre-edit selection, which is what an undo of that edit restores.
	 */
	private captureSelectionCursor(): void {
		if (!this.selectionBinding) {
			return;
		}
		this.selUndo.push(this.selectionBinding.capture());
		this.selRedo.length = 0;
	}

	/**
	 * Restore a captured selection, dropping ids the intervening edit deleted so
	 * the selection never dangles onto a non-existent entity.
	 */
	private restoreSelectionSnapshot(
		binding: SelectionBinding,
		snap: SelectionSnapshot,
	): void {
		const ids = snap.ids.filter((id) => this.isMember(id));
		const primaryId =
			snap.primaryId !== null && this.isMember(snap.primaryId)
				? snap.primaryId
				: (ids.at(-1) ?? null);
		const anchorId =
			snap.anchorId !== null && this.isMember(snap.anchorId)
				? snap.anchorId
				: primaryId;
		binding.restore({ ids, anchorId, primaryId });
	}

	private restoreBaselineWorld(): void {
		this.scene.restore(this._baseline.entities);
		const config = toSceneConfig(this._baseline.config);
		this.scene.config.gravity = config.gravity;
		this.scene.config.uiScale = config.uiScale;
		this.scene.config.clearColor = config.clearColor;
		this.scene.world.setGravity(config.gravity);
	}

	private liveTarget(): ReplayTarget {
		return { world: this.scene.world, config: this.scene.config };
	}

	/**
	 * Replay baseline + journal onto a disposed scratch world and serialize it
	 * whole. The scratch world has never simulated and the journal never records
	 * runtime spawns, so it holds only authored entities — serializing it whole
	 * yields the authored scene bytes with no provenance filter needed.
	 */
	private replayAuthored(config: SceneConfig): SerializedWorld {
		const scratch = new World(config.gravity);
		try {
			deserializeWorld(
				scratch,
				this._baseline.entities,
				`scene "${this.scene.name}" baseline`,
				"throw",
			);
			this.journal.replayPending({ world: scratch, config });
			return serializeWorld(scratch.ecs);
		} finally {
			scratch.dispose();
		}
	}

	/**
	 * A run-world sim-poke: an edit whose target is a runtime-spawned entity
	 * (present in the run world, absent from this document). Only while a run
	 * world is bound.
	 */
	private isPoke(entry: JournalEntry): boolean {
		return (
			entry.kind !== "composite" && this.isRuntimeTargeted(entry)
		);
	}

	/**
	 * Whether `entry` targets only runtime-spawned entities (present in the bound
	 * run world, absent from this document). Entity-creates author document
	 * members and config edits have no entity target, so both are never runtime.
	 * Used to classify a top-level poke and to partition a composite (plan F6).
	 */
	private isRuntimeTargeted(entry: JournalEntry): boolean {
		if (
			!this.runTarget ||
			entry.kind === "entity-create" ||
			entry.kind === "config-set"
		) {
			return false;
		}
		const targets = entryTargets(entry);
		return (
			targets.length > 0 && targets.every((id) => !this.isMember(id))
		);
	}

	private pokeRun(entry: JournalEntry): void {
		if (this.runTarget) {
			applyEntry(entry, this.runTarget);
		}
	}

	/**
	 * Best-effort apply a journaled document edit to the bound run world. A
	 * missing target (the sim already destroyed the entity) is a silent no-op
	 * live; the document stays authoritative (plan D7).
	 */
	private mirrorToRun(entry: JournalEntry | null): void {
		if (!entry || !this.runTarget) {
			return;
		}
		try {
			applyEntry(entry, this.runTarget);
		} catch {
			// D7: run-world live-apply is best-effort projection.
		}
	}

	/**
	 * Backstop for the D6 invariant that no runtime id is ever journaled. The
	 * router classifies pokes before reaching here, so a non-member target at
	 * this point is an unreachable state (a mutation surface that bypassed the
	 * router) — crash loudly rather than bake runtime state into the document.
	 */
	private assertJournalable(entry: JournalEntry): void {
		if (!this.runTarget || entry.kind === "entity-create") {
			return;
		}
		for (const id of entryTargets(entry)) {
			if (!this.isMember(id)) {
				throw new Error(
					`SceneDocument.record: entry "${entry.kind}" targets runtime entity "${id}" not owned by scene "${this.scene.name}"; a mutation surface bypassed the command router.`,
				);
			}
		}
	}

	private assertRoundTrips(
		entities: SerializedWorld,
		config: SceneConfig,
	): void {
		const probe = new World(config.gravity);
		let again: SerializedWorld;
		try {
			deserializeWorld(
				probe,
				entities,
				`scene "${this.scene.name}" round-trip`,
				"throw",
			);
			again = serializeWorld(probe.ecs);
		} finally {
			probe.dispose();
		}
		const diff = firstDiff(entities, again);
		if (diff) {
			throw new Error(
				`Save round-trip check failed for scene "${this.scene.name}" — the journal produced non-reconstructable data.\n${diff}`,
			);
		}
	}

	private assertMatchesLive(entities: SerializedWorld): void {
		const live = serializeWorld(this.scene.world.ecs);
		const diff = firstDiff(entities, live);
		if (diff) {
			throw new Error(
				`Save replay-diff tripwire failed for scene "${this.scene.name}" — the replayed journal disagrees with the live edit world (a non-journaled mutation path or a nondeterministic entry).\n${diff}`,
			);
		}
	}
}

const firstDiff = (
	a: SerializedWorld,
	b: SerializedWorld,
): string | null => {
	const left = JSON.stringify(a, null, "\t").split("\n");
	const right = JSON.stringify(b, null, "\t").split("\n");
	const max = Math.max(left.length, right.length);
	for (let i = 0; i < max; i++) {
		if (left[i] !== right[i]) {
			return `line ${i + 1}:\n  replay: ${left[i] ?? "<end>"}\n  other:  ${right[i] ?? "<end>"}`;
		}
	}
	return null;
};
