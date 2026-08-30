import type { History } from "../history";
import { Subscribable } from "../subscribable";
import { runCommand } from "./command-router";
import {
	type FreeTransformParams,
	IDENTITY_TRANSFORM,
	buildAffine,
} from "./free-transform";
import { type PixelBuffer, blankPixels } from "./pixel-buffer";
import { getClipboard, setClipboard } from "./selection-clipboard";
import { captureBrush } from "./custom-brush";
import {
	type ClipTransform,
	type SelectionClip,
	cropClip,
	liftSelection,
	placeClip,
	rasterizeClip,
	rotateClip,
	stampFloating,
	transformClip,
} from "./selection-lift";
import {
	type SelectionMask,
	type SelectionOp,
	cloneMask,
	combineMask,
	createMask,
	maskContains,
	maskIsEmpty,
	translateMask,
} from "./selection-mask";
import type {
	SelectionSnapshot,
	SpriteDocument,
} from "./sprite-document";

/** Whether a float was lifted from the cel (a move) or dropped in (a paste). */
type FloatSource = "move" | "paste";

/**
 * A live free-transform layered onto a floating selection: the **untransformed**
 * source clip (cropped, with its canvas origin), a movable `pivot` in canvas
 * cells, and the current decomposed `params`. While a session is present the
 * float's `lifted`/`mask` are the rasterised result of `buildAffine(params,
 * pivot) applied to source`, recomputed on every parameter or pivot change;
 * confirming keeps that result and drops the session, cancelling restores the
 * source. Held as an optional field on the `floating` variant (like the mutable
 * drag `offset`) so the existing commit/cancel/marching-ants paths keep working
 * unchanged — commit bakes whatever `lifted` currently holds.
 */
export type FreeTransformSession = {
	/** The untransformed floated pixels + mask, cropped to bounds, origin in cells. */
	readonly source: SelectionClip;
	/** The transform pivot in canvas cell coordinates; movable. */
	readonly pivot: { readonly x: number; readonly y: number };
	/** The current decomposed transform parameters. */
	readonly params: FreeTransformParams;
};

/**
 * The editor's selection, modelled as a discriminated union with a single
 * owner so illegal states cannot be constructed:
 *
 * - `none` — nothing selected.
 * - `marquee` — a mask-only selection (no lifted pixels).
 * - `floating` — pixels lifted off the active cel into their own buffer, drawn
 *   at a live `offset`, awaiting commit or cancel.
 *
 * "Floating with no pixels" is impossible (the variant always carries `lifted`
 * and `base`); "committed twice" is impossible (commit transitions out of
 * `floating` *before* recording, so the choke-point re-entry is a no-op); and a
 * float "stranded across a tool/frame switch" is impossible (every such switch
 * routes through {@link commit}, which folds the float into the cel).
 */
export type SelectionState =
	| { readonly kind: "none" }
	| { readonly kind: "marquee"; readonly mask: SelectionMask }
	| {
			readonly kind: "floating";
			readonly source: FloatSource;
			readonly layerId: string;
			readonly frameIndex: number;
			/** The float's footprint at its original (pre-drag) position. */
			readonly mask: SelectionMask;
			/** Canvas-sized floated pixels at their original position. */
			readonly lifted: PixelBuffer;
			/** The cel to stamp onto: residue (move) or the untouched cel (paste). */
			readonly base: PixelBuffer;
			/** The pre-lift cel, restored on cancel/undo. */
			readonly before: PixelBuffer;
			/** The marquee restored on cancel, or `null` to deselect. */
			readonly restoreMask: SelectionMask | null;
			/** Live drag offset in cells; mutated as the float is dragged. */
			offset: { x: number; y: number };
			/** The live free-transform, or `null` when the float is not being transformed. */
			readonly transform: FreeTransformSession | null;
	  };

/** An in-progress selection gesture, shown as a rubber band before it commits. */
export type SelectionPreview =
	| {
			readonly kind: "rect";
			readonly ax: number;
			readonly ay: number;
			readonly bx: number;
			readonly by: number;
	  }
	| {
			readonly kind: "lasso";
			readonly points: ReadonlyArray<readonly [number, number]>;
	  };

/** A boundary edge in cell coordinates: `(x0,y0)`–`(x1,y1)`, each unit length. */
export type AntEdge = readonly [number, number, number, number];

type SnapshotData =
	| { readonly kind: "none" }
	| { readonly kind: "marquee"; readonly mask: SelectionMask };

const clonePixels = (buf: PixelBuffer): PixelBuffer => ({
	width: buf.width,
	height: buf.height,
	data: new Uint8ClampedArray(buf.data),
});

/**
 * Everything the controller holds *for one attached document*, in a single
 * object so it can only ever be reset as a whole. Adding a field here forces
 * {@link newSession} to seed it, which is the only place a reset is written.
 */
type SelectionSession = {
	readonly doc: SpriteDocument;
	state: SelectionState;
	preview: SelectionPreview | null;
	edges: AntEdge[];
	committing: boolean;
};

const newSession = (doc: SpriteDocument): SelectionSession => ({
	doc,
	state: { kind: "none" },
	preview: null,
	edges: [],
	committing: false,
});

const NO_SELECTION: SelectionState = { kind: "none" };
const NO_EDGES: ReadonlyArray<AntEdge> = [];

/**
 * The single owner of the sprite editor's selection + floating state.
 *
 * It registers the two B12 choke-point bridges on the document — the
 * floating-commit callback ({@link SpriteDocument.registerFloatingCommit}) and
 * the selection capture/restore bridge
 * ({@link SpriteDocument.registerSelectionBridge}) — so that:
 *
 * - every {@link runCommand} (and the document's own active-frame/layer switch,
 *   and save) first folds any uncommitted float into the cel as one undo entry;
 * - undoing a command restores the selection that was active when it ran.
 *
 * The controller holds a live reference to the document's active cel semantics
 * through the {@link SelectionSession} installed by {@link attach}; a new
 * document replaces that session wholesale, so nothing carries over.
 */
export class SelectionController extends Subscribable {
	private session: SelectionSession | null = null;

	constructor(private history: History) {
		super();
	}

	/**
	 * Bind to `doc`: install the choke-point bridges and start an empty session.
	 * Detaches any document already attached first.
	 */
	attach(doc: SpriteDocument): void {
		this.detach();
		this.session = newSession(doc);
		doc.registerFloatingCommit(() => this.commit());
		doc.registerSelectionBridge({
			capture: () => this.capture(),
			restore: (snapshot) => this.restore(snapshot),
		});
		this.notify();
	}

	/** Unbind: remove the choke-point bridges and drop the session. */
	detach(): void {
		const session = this.session;
		this.session = null;
		if (!session) {
			return;
		}
		session.doc.registerFloatingCommit(null);
		session.doc.registerSelectionBridge(null);
		this.notify();
	}

	get state(): SelectionState {
		return this.session?.state ?? NO_SELECTION;
	}

	get preview(): SelectionPreview | null {
		return this.session?.preview ?? null;
	}

	/** Cached marching-ants boundary edges for the displayed selection. */
	get edges(): ReadonlyArray<AntEdge> {
		return this.session?.edges ?? NO_EDGES;
	}

	/** Whether a float is awaiting commit. */
	get floating(): boolean {
		return this.state.kind === "floating";
	}

	/** Whether a live free-transform is being edited on the float. */
	get transforming(): boolean {
		const s = this.state;
		return s.kind === "floating" && s.transform !== null;
	}

	/** The live free-transform session, or `null` when not transforming. */
	get transformSession(): FreeTransformSession | null {
		const s = this.state;
		return s.kind === "floating" ? s.transform : null;
	}

	/** Whether cell `(x, y)` lies inside the current marquee/float footprint. */
	pointInSelection(x: number, y: number): boolean {
		const s = this.state;
		if (s.kind === "marquee") {
			return maskContains(s.mask, x, y);
		}
		if (s.kind === "floating") {
			return maskContains(s.mask, x - s.offset.x, y - s.offset.y);
		}
		return false;
	}

	setPreview(preview: SelectionPreview | null): void {
		if (this.session) {
			this.session.preview = preview;
		}
	}

	/**
	 * Combine a freshly built region into the current marquee under `op` (the
	 * marquee/lasso/wand tools call this on release). Commits any pending float
	 * first, then folds the region in; an empty result deselects.
	 */
	applyRegion(region: SelectionMask, op: SelectionOp): void {
		const session = this.session;
		if (!session) {
			return;
		}
		this.commit();
		const base =
			session.state.kind === "marquee"
				? session.state.mask
				: createMask(region.width, region.height);
		const next = combineMask(base, region, op);
		session.preview = null;
		if (maskIsEmpty(next)) {
			this.setState(session, { kind: "none" });
		} else {
			this.setState(session, { kind: "marquee", mask: next });
		}
	}

	/** Deselect and drop any in-progress preview (does not touch a float). */
	clear(): void {
		const session = this.session;
		if (!session) {
			return;
		}
		session.preview = null;
		if (session.state.kind !== "none") {
			this.setState(session, { kind: "none" });
		}
	}

	/**
	 * Lift the current marquee off the active cel into a floating "move": the
	 * selected pixels are pulled onto their own buffer (leaving transparency
	 * behind) and can be dragged. Returns `false` when there is nothing to move.
	 */
	beginMove(): boolean {
		const session = this.session;
		if (
			!session ||
			session.state.kind !== "marquee" ||
			maskIsEmpty(session.state.mask)
		) {
			return false;
		}
		const { doc } = session;
		const mask = session.state.mask;
		const layerId = doc.activeLayerId;
		const frameIndex = doc.activeFrameIndex;
		const cel = this.activeCel(doc);
		const { lifted, residue } = liftSelection(cel, mask);
		doc.setCel(layerId, frameIndex, clonePixels(residue));
		this.setState(session, {
			kind: "floating",
			source: "move",
			layerId,
			frameIndex,
			mask: cloneMask(mask),
			lifted,
			base: residue,
			before: cel,
			restoreMask: cloneMask(mask),
			offset: { x: 0, y: 0 },
			transform: null,
		});
		return true;
	}

	/** Set the active float's drag offset (cell units); no-op when not floating. */
	dragTo(dx: number, dy: number): void {
		const s = this.state;
		if (s.kind === "floating") {
			s.offset = { x: dx, y: dy };
		}
	}

	/**
	 * Flip the active selection horizontally. A plain marquee is lifted to a float
	 * first (a flagged default); the float's pixels + footprint mirror in place,
	 * re-centred on their bounds so they stay visually anchored. Returns `false`
	 * when there is no selection to transform, so the caller can fall back to the
	 * whole-image flip. Like a drag, the transform mutates the live float and is
	 * folded into the single undo entry produced when the float commits.
	 */
	flipHorizontal(): boolean {
		return this.transformSelection("flip-h");
	}

	/** Flip the active selection vertically. See {@link flipHorizontal}. */
	flipVertical(): boolean {
		return this.transformSelection("flip-v");
	}

	/** Rotate the active selection 90° clockwise. See {@link flipHorizontal}. */
	rotateCw(): boolean {
		return this.transformSelection("rotate-cw");
	}

	/** Rotate the active selection 90° counter-clockwise. See {@link flipHorizontal}. */
	rotateCcw(): boolean {
		return this.transformSelection("rotate-ccw");
	}

	/**
	 * Capture the current selection's pixels as a reusable brush stamp: the masked
	 * region of the active cel (marquee) or the floated pixels (float), cropped to
	 * their bounds. Returns `null` when there is no non-empty selection.
	 */
	captureBrushStamp(): PixelBuffer | null {
		const session = this.session;
		if (!session) {
			return null;
		}
		const s = session.state;
		if (s.kind === "marquee") {
			if (maskIsEmpty(s.mask)) {
				return null;
			}
			return captureBrush(this.activeCel(session.doc), s.mask);
		}
		if (s.kind === "floating") {
			const clip = cropClip(s.lifted, s.mask);
			return clip ? clip.pixels : null;
		}
		return null;
	}

	/**
	 * Lift a marquee to a float if needed, then flip/rotate the float's pixels and
	 * mask in place. Returns whether it acted on a selection.
	 */
	private transformSelection(transform: ClipTransform): boolean {
		const session = this.session;
		if (!session) {
			return false;
		}
		if (session.state.kind === "marquee" && !this.beginMove()) {
			return false;
		}
		const s = session.state;
		if (s.kind !== "floating") {
			return false;
		}
		const clip = cropClip(s.lifted, s.mask);
		if (!clip) {
			return false;
		}
		const t = transformClip(clip, transform);
		const { lifted, mask } = placeClip(
			session.doc.width,
			session.doc.height,
			t,
			t.originX,
			t.originY,
		);
		this.setState(session, { ...s, lifted, mask });
		return true;
	}

	/**
	 * Rotate the active selection by an **arbitrary** angle (degrees,
	 * clockwise-positive) using RotSprite, re-centred on its bounds. A plain
	 * marquee is lifted to a float first; the float's current drag offset (and any
	 * live free-transform preview) is folded in before rotating. Like the 90°
	 * rotations this mutates the live float and is folded into the single undo
	 * entry produced when the float commits. Returns `false` when there is no
	 * selection to rotate.
	 */
	rotateArbitrary(degrees: number): boolean {
		const session = this.session;
		if (!session) {
			return false;
		}
		if (session.state.kind === "marquee" && !this.beginMove()) {
			return false;
		}
		const s = session.state;
		if (s.kind !== "floating") {
			return false;
		}
		const clip = cropClip(s.lifted, s.mask);
		if (!clip) {
			return false;
		}
		const source: SelectionClip = {
			...clip,
			originX: clip.originX + s.offset.x,
			originY: clip.originY + s.offset.y,
		};
		const rotated = rotateClip(source, (degrees * Math.PI) / 180);
		const { lifted, mask } = placeClip(
			session.doc.width,
			session.doc.height,
			rotated,
			rotated.originX,
			rotated.originY,
		);
		this.setState(session, {
			...s,
			offset: { x: 0, y: 0 },
			transform: null,
			lifted,
			mask,
		});
		return true;
	}

	/**
	 * Begin an interactive free-transform on the active selection: a marquee is
	 * lifted to a float first, the float's current drag offset is folded into the
	 * source, the pivot is seeded at the float's bounds centre and the parameters
	 * at identity. Idempotent while a session is already live. Returns `false`
	 * when there is nothing to transform. The transformed pixels are previewed
	 * live; {@link confirmTransform} bakes them into the float and
	 * {@link cancelTransform} restores the untransformed float.
	 */
	beginTransform(): boolean {
		const session = this.session;
		if (!session) {
			return false;
		}
		if (session.state.kind === "marquee" && !this.beginMove()) {
			return false;
		}
		const s = session.state;
		if (s.kind !== "floating") {
			return false;
		}
		if (s.transform) {
			return true;
		}
		const clip = cropClip(s.lifted, s.mask);
		if (!clip) {
			return false;
		}
		const source: SelectionClip = {
			...clip,
			originX: clip.originX + s.offset.x,
			originY: clip.originY + s.offset.y,
		};
		const transform: FreeTransformSession = {
			source,
			pivot: {
				x: source.originX + source.width / 2,
				y: source.originY + source.height / 2,
			},
			params: IDENTITY_TRANSFORM,
		};
		this.applyTransform(
			session,
			{ ...s, offset: { x: 0, y: 0 } },
			transform,
		);
		return true;
	}

	/** Merge `partial` into the live transform's parameters and re-render. No-op unless transforming. */
	updateTransform(partial: Partial<FreeTransformParams>): void {
		const session = this.session;
		if (!session) {
			return;
		}
		const s = session.state;
		if (s.kind !== "floating" || !s.transform) {
			return;
		}
		const transform: FreeTransformSession = {
			...s.transform,
			params: { ...s.transform.params, ...partial },
		};
		this.applyTransform(session, s, transform);
	}

	/** Move the live transform's pivot to a canvas cell and re-render. No-op unless transforming. */
	setTransformPivot(x: number, y: number): void {
		const session = this.session;
		if (!session) {
			return;
		}
		const s = session.state;
		if (s.kind !== "floating" || !s.transform) {
			return;
		}
		this.applyTransform(session, s, {
			...s.transform,
			pivot: { x, y },
		});
	}

	/**
	 * Confirm the live free-transform: keep the transformed pixels as the float's
	 * new content and drop the session (the normal float commit rules then apply).
	 * No-op unless transforming.
	 */
	confirmTransform(): void {
		const session = this.session;
		if (!session) {
			return;
		}
		const s = session.state;
		if (s.kind !== "floating" || !s.transform) {
			return;
		}
		this.setState(session, { ...s, transform: null });
	}

	/** Cancel the live free-transform, restoring the untransformed float. No-op unless transforming. */
	cancelTransform(): void {
		const session = this.session;
		if (!session) {
			return;
		}
		const s = session.state;
		if (s.kind !== "floating" || !s.transform) {
			return;
		}
		const { source } = s.transform;
		const { lifted, mask } = placeClip(
			session.doc.width,
			session.doc.height,
			source,
			source.originX,
			source.originY,
		);
		this.setState(session, {
			...s,
			transform: null,
			lifted,
			mask,
		});
	}

	/**
	 * Enter's meaning while a selection is active: confirm the live transform if
	 * one is being edited, otherwise commit the float into the cel. Two Enters
	 * (confirm, then commit) therefore bake a transform and drop it into the cel.
	 */
	confirmOrCommit(): void {
		if (this.transforming) {
			this.confirmTransform();
			return;
		}
		this.commit();
	}

	private applyTransform(
		session: SelectionSession,
		floating: Extract<SelectionState, { kind: "floating" }>,
		transform: FreeTransformSession,
	): void {
		const matrix = buildAffine(
			transform.params,
			transform.pivot.x,
			transform.pivot.y,
		);
		const { lifted, mask } = rasterizeClip(
			transform.source,
			matrix,
			session.doc.width,
			session.doc.height,
		);
		this.setState(session, { ...floating, transform, lifted, mask });
	}

	/** Copy the current marquee's pixels to the internal clipboard (cel unchanged). */
	copy(): void {
		const session = this.session;
		if (!session) {
			return;
		}
		const s = session.state;
		if (s.kind !== "marquee" || maskIsEmpty(s.mask)) {
			return;
		}
		const { lifted } = liftSelection(
			this.activeCel(session.doc),
			s.mask,
		);
		const clip = cropClip(lifted, s.mask);
		if (clip) {
			setClipboard(clip);
		}
	}

	/**
	 * Copy the current marquee's pixels to the clipboard and clear them from the
	 * active cel as one undo entry. The marquee stays selected (now over the hole).
	 */
	cut(): void {
		const session = this.session;
		if (!session) {
			return;
		}
		const s = session.state;
		if (s.kind !== "marquee" || maskIsEmpty(s.mask)) {
			return;
		}
		const { doc } = session;
		const mask = s.mask;
		const layerId = doc.activeLayerId;
		const frameIndex = doc.activeFrameIndex;
		const cel = this.activeCel(doc);
		const { lifted, residue } = liftSelection(cel, mask);
		const clip = cropClip(lifted, mask);
		if (clip) {
			setClipboard(clip);
		}
		const before = cel;
		runCommand(doc, this.history, {
			redo: () =>
				doc.setCel(layerId, frameIndex, clonePixels(residue)),
			undo: () =>
				doc.setCel(layerId, frameIndex, clonePixels(before)),
		});
	}

	/**
	 * Create a floating selection from the internal clipboard, positioned at the
	 * pixels' original location (a flagged default). Commits any pending float
	 * first. No-op when the clipboard is empty.
	 */
	paste(): void {
		const session = this.session;
		const clip = getClipboard();
		if (!session || !clip) {
			return;
		}
		this.commit();
		const { doc } = session;
		const restoreMask =
			session.state.kind === "marquee"
				? cloneMask(session.state.mask)
				: null;
		const { lifted, mask } = placeClip(
			doc.width,
			doc.height,
			clip,
			clip.originX,
			clip.originY,
		);
		const layerId = doc.activeLayerId;
		const frameIndex = doc.activeFrameIndex;
		const cel = this.activeCel(doc);
		this.setState(session, {
			kind: "floating",
			source: "paste",
			layerId,
			frameIndex,
			mask,
			lifted,
			base: cel,
			before: cel,
			restoreMask,
			offset: { x: 0, y: 0 },
			transform: null,
		});
	}

	/**
	 * The floating-commit choke-point: fold any pending float into its cel as one
	 * undo entry, then transition to a marquee over the stamped pixels. A no-op
	 * unless a float is active, so it is safe (and idempotent) to call before any
	 * unrelated command — which is exactly what {@link runCommand} does. Guarded
	 * against re-entry so the {@link runCommand} it issues cannot recurse into it.
	 */
	commit(): void {
		const session = this.session;
		if (
			!session ||
			session.state.kind !== "floating" ||
			session.committing
		) {
			return;
		}
		const { doc } = session;
		const f = session.state;
		const final = stampFloating(
			f.base,
			f.lifted,
			f.offset.x,
			f.offset.y,
		);
		const before = f.before;
		const postMask = translateMask(f.mask, f.offset.x, f.offset.y);
		const preMask = f.restoreMask;
		const { layerId, frameIndex } = f;

		// Leave `floating` before recording so the re-entrant choke-point (and
		// the selection captured by runCommand) see the pre-lift marquee, which is
		// what undo must restore.
		this.setState(
			session,
			preMask ? { kind: "marquee", mask: preMask } : { kind: "none" },
		);
		session.committing = true;
		try {
			runCommand(doc, this.history, {
				redo: () => {
					doc.setCel(layerId, frameIndex, clonePixels(final));
					this.setState(session, {
						kind: "marquee",
						mask: cloneMask(postMask),
					});
				},
				undo: () => {
					doc.setCel(layerId, frameIndex, clonePixels(before));
					this.setState(
						session,
						preMask
							? { kind: "marquee", mask: cloneMask(preMask) }
							: { kind: "none" },
					);
				},
			});
		} finally {
			session.committing = false;
		}
	}

	/**
	 * Cancel: discard a floating selection (restoring the lifted pixels for a
	 * move, or dropping a paste) with no undo entry, or clear a plain marquee.
	 */
	escape(): void {
		const session = this.session;
		if (!session) {
			return;
		}
		const s = session.state;
		if (s.kind === "floating" && s.transform) {
			this.cancelTransform();
			return;
		}
		if (s.kind === "floating") {
			session.doc.setCel(
				s.layerId,
				s.frameIndex,
				clonePixels(s.before),
			);
			this.setState(
				session,
				s.restoreMask
					? { kind: "marquee", mask: s.restoreMask }
					: { kind: "none" },
			);
			return;
		}
		if (s.kind === "marquee") {
			this.clear();
		}
	}

	private capture(): SelectionSnapshot | null {
		const s = this.state;
		if (s.kind === "marquee") {
			return {
				kind: "marquee",
				mask: cloneMask(s.mask),
			};
		}
		return { kind: "none" };
	}

	private restore(snapshot: SelectionSnapshot | null): void {
		const session = this.session;
		if (!session || !snapshot) {
			return;
		}
		const data = snapshot as unknown as SnapshotData;
		if (data.kind === "marquee") {
			this.setState(session, {
				kind: "marquee",
				mask: cloneMask(data.mask),
			});
		} else {
			this.setState(session, { kind: "none" });
		}
	}

	private activeCel(doc: SpriteDocument): PixelBuffer {
		const cel = doc.getCel(doc.activeLayerId, doc.activeFrameIndex);
		return cel
			? clonePixels(cel)
			: blankPixels(doc.width, doc.height);
	}

	private setState(
		session: SelectionSession,
		next: SelectionState,
	): void {
		session.state = next;
		session.edges = computeEdges(next);
		this.notify();
	}
}

/** Boundary edges of the displayed selection, for the marching-ants overlay. */
const computeEdges = (state: SelectionState): AntEdge[] => {
	const mask =
		state.kind === "marquee"
			? state.mask
			: state.kind === "floating"
				? state.mask
				: null;
	if (!mask) {
		return [];
	}
	const { width, height, data } = mask;
	const edges: AntEdge[] = [];
	const set = (x: number, y: number): boolean =>
		x >= 0 &&
		y >= 0 &&
		x < width &&
		y < height &&
		data[y * width + x] === 1;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (data[y * width + x] !== 1) {
				continue;
			}
			if (!set(x, y - 1)) {
				edges.push([x, y, x + 1, y]);
			}
			if (!set(x, y + 1)) {
				edges.push([x, y + 1, x + 1, y + 1]);
			}
			if (!set(x - 1, y)) {
				edges.push([x, y, x, y + 1]);
			}
			if (!set(x + 1, y)) {
				edges.push([x + 1, y, x + 1, y + 1]);
			}
		}
	}
	return edges;
};
