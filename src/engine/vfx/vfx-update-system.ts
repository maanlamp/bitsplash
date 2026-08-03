import type { Camera2D } from "../camera/camera-2d";
import type { Seconds } from "../duration";
import type { ECS, ReadonlyECS } from "../ecs";
import type {
	MutableRaycastHit,
	RaycastFilter,
} from "../physics/physics";
import type { Mutable } from "../mutable";
import { profiler } from "../profiling/profiler";
import Vector2 from "../vector2";
import { weatherParticleScale } from "../settings/weather-particle-scale";
import { type UpdateContext, UpdateSystem } from "../system";
import {
	mergedBlockingCells,
	mergedSolidCells,
	type TileBlockingClass,
	tileCellKey,
} from "../tilemap/occupancy";
import { TILE_SIZE } from "../tilemap/tile";
import { TransformComponent } from "../transform-component";
import { ambientTime } from "../weather/ambient-clock";
import {
	type ExposureField,
	exposureField,
} from "../weather/exposure-field";
import { sampleWindFrame } from "../weather/sample-wind";
import {
	type WeatherFrame,
	weatherFrame,
} from "../weather/weather-frame";
import {
	EmitterComponent,
	readonlyEmitter,
} from "./emitter-component";
import type {
	VfxDecalSpec,
	VfxDef,
	VfxEmitterPart,
	VfxRibbonPart,
	VfxWeatherScaling,
} from "./vfx-def";
import { hasVfxDefs, resolveVfxDef } from "./vfx-registry";
import type {
	VfxEffect,
	VfxEmitOrigin,
	VfxPool,
	VfxRibbonBand,
	VfxStore,
} from "./vfx-store";
import {
	isWeatherDriven,
	vfxWeatherInfluence,
} from "./vfx-weather-influence";

/**
 * Longest frame the particle sim will integrate, in seconds.
 *
 * Raw `requestAnimationFrame` gaps — a tab regaining focus, a slow asset load,
 * an editor panel resize — arrive as multi-second deltas. Integrated straight,
 * a spawn accumulator would dump its whole debt in one frame and a pool would
 * flash full; clamping trades a moment of slow motion for never doing that.
 */
const MAX_STEP = 1 / 15;

/**
 * Shortest move segment worth casting, squared, in world units.
 *
 * Below it a particle has effectively not moved, and a zero-length ray either
 * finds nothing or reports the degenerate toi-0 hit of a particle that already
 * started inside a body. Both are noise; the segment is skipped.
 */
const MIN_SEGMENT_SQ = 1e-6;

/**
 * What a particle's segment cast may hit: everything solid, nothing that is only
 * a trigger.
 *
 * Terrain is static bodies and characters and crates are dynamic ones, so the
 * whole predicate reduces to "not a sensor" — an engine-level statement of the
 * blood spec's "terrain + dynamic bodies, `!body.isSensor`", which named the two
 * because those are the two kinds that exist. Hoisted because a closure per
 * particle per frame is exactly what the no-allocation rule is about.
 */
const NOT_SENSOR: RaycastFilter = (body) => !body.isSensor;

/**
 * The blocking classification a precipitation part is sheltered by, or `null`
 * when the part is not precipitation — the one authored flag that turns on both
 * weather-classified collision and the sheltered-column confinement below.
 */
const precipitationBlocking = (
	part: VfxEmitterPart,
): TileBlockingClass | null =>
	part.collision.mode === "tiles" && part.collision.cells !== "solid"
		? part.collision.cells
		: null;

/** Whether any of a def's parts places itself from the camera. */
const tracksCamera = (def: VfxDef): boolean =>
	def.parts.some((part) =>
		part.kind === "emitter"
			? part.spawn.kind === "camera-band"
			: part.origin === "camera",
	);

/**
 * Advance a particle's position and velocity by `t` seconds in closed form,
 * writing back into the pool.
 *
 * Used for seed-by-age, which places a steady-state population without
 * stepping: the drag model `dv/dt = a - k v` integrates exactly, so a particle
 * born "1.4 seconds ago" lands where 84 frames of Euler would have put it for
 * the cost of one `exp`. Wind is deliberately not part of it — the wind signal
 * is a function of time the closed form cannot see, and seeding predates the
 * frame anyway.
 */
const advanceAnalytically = (
	pool: VfxPool,
	i: number,
	part: VfxEmitterPart,
	t: number,
): void => {
	const k = part.drag;
	const g = part.gravity;
	const vx = pool.vx[i]!;
	const vy = pool.vy[i]!;
	if (k > 0) {
		const decay = Math.exp(-k * t);
		const terminal = g / k;
		pool.x[i] = pool.x[i]! + (vx * (1 - decay)) / k;
		pool.y[i] =
			pool.y[i]! + ((vy - terminal) * (1 - decay)) / k + terminal * t;
		pool.vx[i] = vx * decay;
		pool.vy[i] = (vy - terminal) * decay + terminal;
	} else {
		pool.x[i] = pool.x[i]! + vx * t;
		pool.y[i] = pool.y[i]! + vy * t + 0.5 * g * t * t;
		pool.vy[i] = vy + g * t;
	}
	pool.rotation[i] = pool.rotation[i]! + pool.spin[i]! * t;
	pool.age[i] = t;
};

/**
 * Spawns, advects, collides, and ages every particle in the world.
 *
 * Placed in `ambientSystems()`, which the shipped game spreads after
 * `gameplaySystems` — so VFX steps past `CameraShakeSystem` (camera-tracked
 * emitters read the current-frame pose) and before the end-of-frame event clear
 * — and which the editor's edit composition spreads for live authoring preview.
 * **Never** `editWorldSystems`, which the game composition also spreads: that
 * would double-step VFX in the shipped game, at the wrong position.
 *
 * Emitter config is re-read from scratch every frame and nothing derived is
 * cached. The ECS emits no field-mutation events, so re-reading is the only
 * structurally safe change detection — and it is what makes def hot-reload,
 * inspector edits, and undo/redo take effect with no invalidation protocol.
 *
 * The time base is the shared ambient clock, not a VFX-owned counter, so
 * particles, foliage sway, and wind gusts stay phase-coherent by construction.
 */
@profiler("VFX", "VFX")
export class VfxUpdateSystem implements UpdateSystem {
	private hooked: ECS | null = null;
	private readonly shelter = new Map<
		TileBlockingClass,
		ExposureField
	>();
	private shelterCenterX = 0;
	private shelterCenterY = 0;
	private cameraCentreX: number | null = null;
	private cameraCentreY: number | null = null;
	private cameraCut = false;

	/**
	 * Emit origins handed to the store, refilled per call.
	 *
	 * The store reads an origin and returns; nothing retains one past the call, so
	 * one buffer per kind serves every emitting part instead of a literal per
	 * spawn — and a spawn happens on most frames for every continuous emitter.
	 */
	private readonly emitOrigin: Mutable<VfxEmitOrigin> = {
		x: 0,
		y: 0,
		spreadX: 0,
		spreadY: 0,
		angle: 0,
	};

	private readonly ribbonOrigin = { x: 0, y: 0 };

	/** Segment endpoints handed to `world.raycastInto`, reused for every cast. */
	private readonly rayFrom = { x: 0, y: 0 };
	private readonly rayTo = { x: 0, y: 0 };

	/**
	 * The contact the cast writes into. One per system rather than one per
	 * particle: a blood burst casts every droplet's segment every frame, and an
	 * allocated hit per droplet is exactly what the no-allocation rule forbids.
	 */
	private readonly rayHit: MutableRaycastHit = {
		point: new Vector2(0, 0),
		normal: new Vector2(0, 0),
		body: null,
	};

	constructor(readonly store: VfxStore) {}

	update(ctx: UpdateContext): void {
		const { ecs } = ctx;
		this.installCleanupHook(ecs);
		if (!hasVfxDefs()) {
			return;
		}
		const dt = Math.min(Math.max(ctx.time.dt, 0), MAX_STEP);
		this.shelter.clear();
		this.shelterCenterX = ctx.camera?.position.x ?? 0;
		this.shelterCenterY = ctx.camera?.position.y ?? 0;
		this.cameraCut = this.detectCameraCut(ctx.camera);
		this.store.evict(ecs);
		const weather = weatherFrame(ecs);
		this.syncEmitters(ctx, weather, dt);
		const time = ambientTime(ecs);
		for (const effect of this.store.effects()) {
			this.advance(ctx, effect, dt, time);
		}
		this.store.decals.step(ecs, dt);
		this.store.pruneLoose();
	}

	/**
	 * Claim emitter cleanup on this world, once.
	 *
	 * `ecs.onDestroy` is a bare last-writer-wins `Map.set`, so a second owner
	 * would silently unhook this one and leave dead hosts emitting forever. The
	 * assertion turns that into a crash at wiring time.
	 */
	private installCleanupHook(ecs: ECS): void {
		if (this.hooked === ecs) {
			return;
		}
		if (ecs.hasDestroyHook(EmitterComponent)) {
			throw new Error(
				"VfxUpdateSystem: a cleanup hook for EmitterComponent is already installed on this world. ecs.onDestroy is last-writer-wins, so two owners would silently unhook each other — add exactly one VFX system pair per world (see createVfxSystems).",
			);
		}
		ecs.onDestroy(EmitterComponent, (_component, id) => {
			this.store.detach(id);
		});
		this.hooked = ecs;
	}

	/**
	 * Reconcile the store against the world's emitters, then spawn this frame's
	 * particles.
	 */
	private syncEmitters(
		ctx: UpdateContext,
		weather: WeatherFrame,
		dt: number,
	): void {
		const { ecs } = ctx;
		for (const [id, emitter, transform] of ecs.query(
			EmitterComponent,
			TransformComponent,
		)) {
			const config = readonlyEmitter(emitter);
			if (config.defId.length === 0) {
				this.store.dropAttached(id);
				continue;
			}
			const def = resolveVfxDef(config.defId);
			const originX = transform.position.x + config.offset.x;
			const originY = transform.position.y + config.offset.y;
			let effect = this.store.attachedEffect(id);
			if (
				!effect ||
				effect.def !== def ||
				(this.cameraCut && tracksCamera(def))
			) {
				effect = this.store.replaceAttached(
					id,
					def,
					originX,
					originY,
				);
			}
			effect.originX = originX;
			effect.originY = originY;
			effect.emitting = config.enabled;
			this.stepHosted(ctx, effect, weather, config.rateScale, dt);
		}
	}

	/**
	 * Bring one hosted effect up to date: start it if this is its first frame,
	 * then spawn the particles and ribbons this frame's rate asks for.
	 *
	 * Split out of the emitter sweep so the origin resolution and the stepping
	 * read as the two things they are.
	 */
	private stepHosted(
		ctx: UpdateContext,
		effect: VfxEffect,
		weather: WeatherFrame,
		rateScale: number,
		dt: number,
	): void {
		if (!effect.started) {
			effect.started = true;
			this.start(ctx, effect, weather, rateScale);
		}
		if (!effect.emitting) {
			return;
		}
		for (const state of effect.parts) {
			if (state.kind === "ribbon") {
				this.topUpRibbons(
					ctx.camera,
					effect,
					state.part,
					state.band,
					weather,
					rateScale,
				);
				continue;
			}
			const { part, pool } = state;
			if (part.rate === 0) {
				continue;
			}
			pool.accumulator += emissionRate(part, rateScale, weather) * dt;
			const count = Math.floor(pool.accumulator);
			if (count === 0) {
				continue;
			}
			pool.accumulator -= count;
			const origin = this.originFor(ctx.camera, effect, part);
			if (origin) {
				const before = pool.count;
				this.store.emit(pool, part, count, origin);
				this.cullSheltered(ctx.ecs, part, pool, before, effect);
			}
		}
	}

	/**
	 * Keep a band at the population this frame's weather asks for, replacing
	 * ribbons as they expire.
	 *
	 * The target only ever pulls new ribbons in; when the weather drops, the
	 * surplus lives out rather than vanishing mid-frame. Each new ribbon is placed
	 * independently, so a `camera` band scatters across the view rather than
	 * stacking on one point.
	 */
	private topUpRibbons(
		camera: Camera2D | null,
		effect: VfxEffect,
		part: VfxRibbonPart,
		band: VfxRibbonBand,
		weather: WeatherFrame,
		rateScale: number,
	): void {
		const target = Math.min(
			band.capacity,
			Math.round(
				part.count * rateScale * weatherScale(part.weather, weather),
			),
		);
		while (band.count < target) {
			const origin = this.ribbonOriginFor(camera, effect, part);
			if (!origin) {
				return;
			}
			this.store.spawnRibbons(band, part, 1, origin.x, origin.y);
		}
	}

	/**
	 * Whether the view moved discontinuously since the last frame — a cut, a
	 * teleport, a scene entry — measured as more than half a viewport in one step.
	 *
	 * A camera-band part's population is placed relative to the view, so a jump
	 * leaves it stranded and the band would refill over a whole particle lifetime.
	 * Rebuilding those effects re-runs seed-by-age, which is the pre-warm.
	 */
	private detectCameraCut(camera: Camera2D | null): boolean {
		if (!camera) {
			this.cameraCentreX = null;
			this.cameraCentreY = null;
			return false;
		}
		const bounds = camera.visibleBounds();
		const centreX = (bounds.min.x + bounds.max.x) / 2;
		const centreY = (bounds.min.y + bounds.max.y) / 2;
		const previousX = this.cameraCentreX;
		const previousY = this.cameraCentreY;
		this.cameraCentreX = centreX;
		this.cameraCentreY = centreY;
		if (previousX === null || previousY === null) {
			return false;
		}
		return (
			Math.abs(centreX - previousX) >
				(bounds.max.x - bounds.min.x) / 2 ||
			Math.abs(centreY - previousY) >
				(bounds.max.y - bounds.min.y) / 2
		);
	}

	/**
	 * Bring a freshly (re)created effect up to its steady state: fire each part's
	 * authored burst, then **seed by age** — spawn the population a continuous
	 * emitter would already have produced, with randomized ages and positions
	 * advanced in closed form.
	 *
	 * This is what makes VFX run-state safely non-restorable. A thaw, a scene
	 * revisit, a def hot-reload, and an undo all rebuild the effect, and seeding
	 * means a restored save shows a full drift of leaves on its first frame
	 * instead of an empty sky filling in over the next two seconds.
	 *
	 * Ribbons seed the same way: the band comes up full with its ages spread over
	 * their lifetimes, so a restored save shows a sky already full of wind lines
	 * at staggered points in their fade rather than a set that all appear and all
	 * expire together.
	 */
	private start(
		ctx: UpdateContext,
		effect: VfxEffect,
		weather: WeatherFrame,
		rateScale: number,
	): void {
		for (const state of effect.parts) {
			if (state.kind === "ribbon") {
				const { part, band } = state;
				this.topUpRibbons(
					ctx.camera,
					effect,
					part,
					band,
					weather,
					rateScale,
				);
				for (let i = 0; i < band.count; i++) {
					band.age[i] = this.store.random() * band.life[i]!;
				}
				continue;
			}
			const { part, pool } = state;
			const origin = this.originFor(ctx.camera, effect, part);
			if (!origin) {
				continue;
			}
			if (part.burst > 0) {
				this.store.emit(pool, part, part.burst, origin);
			}
			const rate = emissionRate(part, rateScale, weather);
			if (rate > 0) {
				const meanLife = (part.lifetime.min + part.lifetime.max) / 2;
				const steady = Math.round(rate * meanLife);
				const before = pool.count;
				this.store.emit(pool, part, steady, origin);
				for (let i = before; i < pool.count; i++) {
					advanceAnalytically(
						pool,
						i,
						part,
						this.store.random() * pool.life[i]!,
					);
				}
			}
			this.cullSheltered(ctx.ecs, part, pool, 0, effect);
		}
	}

	/**
	 * Drop the precipitation particles in `[from, count)` that sit under cover.
	 *
	 * Spawn placement knows nothing about roofs — a camera band stretches across
	 * whatever the view happens to contain, and seed-by-age scatters particles down
	 * through it — so this is where "rain only exists where the sky reaches" is
	 * enforced, for a frame's spawns and for a seeded population alike. Particles
	 * are killed rather than {@link die}d: an on-death splash under an eave is
	 * exactly the artefact this prevents.
	 */
	private cullSheltered(
		ecs: ReadonlyECS,
		part: VfxEmitterPart,
		pool: VfxPool,
		from: number,
		effect: VfxEffect,
	): void {
		const blocking = precipitationBlocking(part);
		if (blocking === null || pool.count === from) {
			return;
		}
		const field = this.shelterField(ecs, blocking);
		const baseX = pool.local ? effect.originX : 0;
		const baseY = pool.local ? effect.originY : 0;
		let i = from;
		while (i < pool.count) {
			if (sheltered(field, baseX + pool.x[i]!, baseY + pool.y[i]!)) {
				pool.kill(i);
			} else {
				i++;
			}
		}
	}

	/**
	 * Where a part spawns this frame, or `null` when it cannot — a camera-band
	 * part in a world with no active camera, which is a still editor view rather
	 * than an error.
	 */
	private originFor(
		camera: Camera2D | null,
		effect: VfxEffect,
		part: VfxEmitterPart,
	): VfxEmitOrigin | null {
		const shape = part.spawn;
		const origin = this.emitOrigin;
		origin.angle = 0;
		if (shape.kind === "camera-band") {
			if (!camera) {
				return null;
			}
			const bounds = camera.visibleBounds();
			origin.x = (bounds.min.x + bounds.max.x) / 2;
			origin.y = bounds.min.y + shape.offsetY;
			origin.spreadX =
				(bounds.max.x - bounds.min.x) * shape.widthScale;
			origin.spreadY = shape.height;
			return origin;
		}
		const local = part.space === "local";
		origin.x = local ? 0 : effect.originX;
		origin.y = local ? 0 : effect.originY;
		origin.spreadX = shape.kind === "box" ? shape.width : 0;
		origin.spreadY = shape.kind === "box" ? shape.height : 0;
		return origin;
	}

	/**
	 * Where one new ribbon starts, in its band's own space, or `null` when it
	 * cannot start — a `camera` ribbon in a world with no active camera.
	 *
	 * A `camera` ribbon lands anywhere in the visible bounds, which is what lets
	 * wind lines cross the view without an emitter tracking the player. There is
	 * deliberately no spawn *shape* here: a ribbon has one origin, a length and a
	 * heading, so scattering it over a box would be scattering the wrong thing.
	 */
	private ribbonOriginFor(
		camera: Camera2D | null,
		effect: VfxEffect,
		part: VfxRibbonPart,
	): Readonly<{ x: number; y: number }> | null {
		const origin = this.ribbonOrigin;
		if (part.origin === "camera") {
			if (!camera) {
				return null;
			}
			const bounds = camera.visibleBounds();
			origin.x = this.store.between(bounds.min.x, bounds.max.x);
			origin.y = this.store.between(bounds.min.y, bounds.max.y);
			return origin;
		}
		const local = part.space === "local";
		origin.x = local ? 0 : effect.originX;
		origin.y = local ? 0 : effect.originY;
		return origin;
	}

	/** Integrate, collide, and age one effect's parts. */
	private advance(
		ctx: UpdateContext,
		effect: VfxEffect,
		dt: number,
		time: Seconds,
	): void {
		const { ecs } = ctx;
		for (const state of effect.parts) {
			if (state.kind === "ribbon") {
				this.advanceRibbons(
					ecs,
					effect,
					state.part,
					state.band,
					dt,
					time,
				);
				continue;
			}
			const { part, pool } = state;
			if (pool.count === 0) {
				continue;
			}
			const baseX = pool.local ? effect.originX : 0;
			const baseY = pool.local ? effect.originY : 0;
			const windGain = part.wind;
			const frame = weatherFrame(ecs);
			const collision = part.collision;
			const response =
				collision.mode === "none"
					? "passThrough"
					: collision.response;
			const raycasting = collision.mode === "raycast";
			const blocking = precipitationBlocking(part);
			const collisionCells =
				response === "passThrough"
					? null
					: blocking
						? mergedBlockingCells(ecs, blocking)
						: mergedSolidCells(ecs);
			const shelter = blocking
				? this.shelterField(ecs, blocking)
				: null;
			let i = 0;
			while (i < pool.count) {
				const age = pool.age[i]! + dt;
				if (age >= pool.life[i]!) {
					this.die(part, pool, i, baseX, baseY);
					continue;
				}
				pool.age[i] = age;
				if (pool.resting(i)) {
					i++;
					continue;
				}
				const fromX = pool.x[i]!;
				const fromY = pool.y[i]!;
				const wind =
					windGain === 0
						? 0
						: windGain *
							sampleWindFrame(
								frame,
								baseX + fromX,
								baseY + fromY,
								time,
							);
				const vx =
					pool.vx[i]! + (wind - part.drag * pool.vx[i]!) * dt;
				const vy =
					pool.vy[i]! + (part.gravity - part.drag * pool.vy[i]!) * dt;
				pool.vx[i] = vx;
				pool.vy[i] = vy;
				pool.x[i] = fromX + vx * dt;
				pool.y[i] = fromY + vy * dt;
				pool.rotation[i] = pool.rotation[i]! + pool.spin[i]! * dt;
				if (
					collisionCells !== null &&
					pool.reacts(i) &&
					(raycasting
						? this.collideByRay(
								ctx,
								part,
								pool,
								i,
								baseX,
								baseY,
								fromX,
								fromY,
							)
						: this.collideByCell(
								collisionCells,
								part,
								pool,
								i,
								baseX,
								baseY,
							))
				) {
					if (response === "rest") {
						pool.rest(i);
					} else {
						this.die(part, pool, i, baseX, baseY);
						continue;
					}
				}
				if (
					shelter &&
					sheltered(shelter, baseX + pool.x[i]!, baseY + pool.y[i]!)
				) {
					pool.kill(i);
					continue;
				}
				i++;
			}
		}
	}

	/**
	 * Test a particle against the merged tile set and leave its mark if it hit.
	 *
	 * A cell test has no contact point and no surface normal, so the mark is laid
	 * along the direction of travel — which is what a smear looks like anyway, and
	 * all a settling leaf's ground mark needs.
	 */
	private collideByCell(
		cells: ReadonlySet<number>,
		part: VfxEmitterPart,
		pool: VfxPool,
		i: number,
		baseX: number,
		baseY: number,
	): boolean {
		const x = baseX + pool.x[i]!;
		const y = baseY + pool.y[i]!;
		if (!inBlockingCell(cells, x, y)) {
			return false;
		}
		if (part.decal) {
			this.store.spawnDecal(
				part.decal,
				null,
				x,
				y,
				Math.atan2(pool.vy[i]!, pool.vx[i]!),
			);
		}
		return true;
	}

	/**
	 * Cast a particle's whole move segment against the physics world, snap it to
	 * the surface it hit, and leave its mark there.
	 *
	 * This is the mode that can see dynamic bodies, which is what blood needs: a
	 * spurt has to land on the enemy that was hit, not on the tile behind it. It
	 * also cannot tunnel — a fast particle that would have skipped over a one-tile
	 * ledge between two cell tests still finds it along the segment.
	 *
	 * A **degenerate hit** — one at the segment's own start — is **not** a
	 * collision. Every burst fired at an impact point starts on the collider it
	 * was fired at, so a droplet's first cast reports the surface it was born on;
	 * treating that as a hit killed the whole spurt on its spawn frame and blood
	 * never appeared. Ignoring it lets the spray leave the wound, and the droplet
	 * collides normally on the first segment that actually travels.
	 */
	private collideByRay(
		ctx: UpdateContext,
		part: VfxEmitterPart,
		pool: VfxPool,
		i: number,
		baseX: number,
		baseY: number,
		fromX: number,
		fromY: number,
	): boolean {
		const originX = baseX + fromX;
		const originY = baseY + fromY;
		const targetX = baseX + pool.x[i]!;
		const targetY = baseY + pool.y[i]!;
		const dx = targetX - originX;
		const dy = targetY - originY;
		if (dx * dx + dy * dy < MIN_SEGMENT_SQ) {
			return false;
		}
		this.rayFrom.x = originX;
		this.rayFrom.y = originY;
		this.rayTo.x = targetX;
		this.rayTo.y = targetY;
		const hit = this.rayHit;
		if (
			!ctx.world.raycastInto(
				this.rayFrom,
				this.rayTo,
				NOT_SENSOR,
				hit,
			)
		) {
			return false;
		}
		const travelX = hit.point.x - originX;
		const travelY = hit.point.y - originY;
		if (travelX * travelX + travelY * travelY < MIN_SEGMENT_SQ) {
			return false;
		}
		pool.x[i] = hit.point.x - baseX;
		pool.y[i] = hit.point.y - baseY;
		if (part.decal) {
			this.mark(ctx.ecs, part.decal, hit);
		}
		return true;
	}

	/**
	 * Place the decal a raycast hit earned, in the frame of reference the surface
	 * deserves: pinned to the world on terrain, and stored as a body-space offset
	 * on anything dynamic so the smear rides its victim.
	 *
	 * A dynamic body with no entity behind it — or one whose transform has already
	 * gone — falls back to a world-static mark rather than being dropped: a smear
	 * in the right place that does not follow beats no smear at all.
	 */
	private mark(
		ecs: ReadonlyECS,
		spec: VfxDecalSpec,
		hit: MutableRaycastHit,
	): void {
		const angle =
			Math.atan2(hit.normal.y, hit.normal.x) + Math.PI / 2;
		const body = hit.body;
		if (!body) {
			return;
		}
		const host = body.userData;
		if (host !== null && !body.isStatic) {
			const transform = ecs.getComponent(host, TransformComponent);
			if (transform) {
				this.store.spawnDecal(
					spec,
					host,
					hit.point.x - transform.position.x,
					hit.point.y - transform.position.y,
					angle,
				);
				return;
			}
		}
		this.store.spawnDecal(
			spec,
			null,
			hit.point.x,
			hit.point.y,
			angle,
		);
	}

	/**
	 * Age one band's ribbons and let the wind carry them.
	 *
	 * A ribbon integrates a drift **velocity** rather than an acceleration: it is
	 * a mark the wind has already made, not an object being pushed, so it should
	 * travel with the air rather than accelerate through it. Shape is not
	 * integrated at all — the path generator regenerates it from age, seed and
	 * time every frame, which is why a band stores six floats per ribbon.
	 */
	private advanceRibbons(
		ecs: ReadonlyECS,
		effect: VfxEffect,
		part: VfxRibbonPart,
		band: VfxRibbonBand,
		dt: number,
		time: Seconds,
	): void {
		if (band.count === 0) {
			return;
		}
		const baseX = band.local ? effect.originX : 0;
		const baseY = band.local ? effect.originY : 0;
		const windGain = part.wind;
		const frame = weatherFrame(ecs);
		let i = 0;
		while (i < band.count) {
			const age = band.age[i]! + dt;
			if (age >= band.life[i]!) {
				band.kill(i);
				continue;
			}
			band.age[i] = age;
			if (windGain !== 0) {
				band.x[i] =
					band.x[i]! +
					windGain *
						sampleWindFrame(
							frame,
							baseX + band.x[i]!,
							baseY + band.y[i]!,
							time,
						) *
						dt;
			}
			i++;
		}
	}

	/**
	 * Retire a particle, firing its part's on-death sub-effect at the world
	 * position it died in — how a raindrop becomes a splash without either def
	 * knowing about the other's parts.
	 */
	private die(
		part: VfxEmitterPart,
		pool: VfxPool,
		i: number,
		baseX: number,
		baseY: number,
	): void {
		if (part.onDeath !== null) {
			this.store.spawnBurst(
				part.onDeath,
				baseX + pool.x[i]!,
				baseY + pool.y[i]!,
			);
		}
		pool.kill(i);
	}

	/**
	 * The world's shelter geometry, resolved once per frame.
	 *
	 * `exposureField` polls a cache key that queries layers and builds a signature
	 * string, which is fine once a frame and ruinous once a particle.
	 *
	 * The window centres on this frame's camera, which is the same point the
	 * weather audio uses as its listener, so both share one cached field instead of
	 * rebuilding it out from under each other twice a frame.
	 */
	private shelterField(
		ecs: ReadonlyECS,
		blocking: TileBlockingClass,
	): ExposureField {
		const cached = this.shelter.get(blocking);
		if (cached) {
			return cached;
		}
		const field = exposureField(
			ecs,
			this.shelterCenterX,
			this.shelterCenterY,
			blocking,
		);
		this.shelter.set(blocking, field);
		return field;
	}
}

/**
 * Whether a world point sits in a tile that stops the part this cell set was
 * resolved for.
 *
 * The set is resolved once per part in {@link VfxUpdateSystem} rather than per
 * particle: it is cached against the tile layers' versions, so the lookup here
 * is one packed key and one `Set.has`, and nothing is allocated per drop.
 */
const inBlockingCell = (
	cells: ReadonlySet<number>,
	x: number,
	y: number,
): boolean =>
	cells.has(
		tileCellKey(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE)),
	);

/**
 * Whether a world point sits under cover — below the topmost blocking tile of
 * its column.
 *
 * `roofHeight` answers in grid rows and covers every authored column rather than
 * only the derived window, so this is valid off-screen, where a camera band's
 * edges and a seeded population both reach.
 */
const sheltered = (
	field: ExposureField,
	x: number,
	y: number,
): boolean => {
	const roof = field.roofHeight(Math.floor(x / TILE_SIZE));
	return roof !== null && y > roof * TILE_SIZE;
};

/**
 * How much of a part's authored emission survives this frame: the live weather,
 * and — for a weather-driven part only — the player's weather quality and
 * density.
 *
 * The settings are honoured **here**, at the emitter, rather than inside
 * {@link vfxWeatherInfluence}: the influence also scales a ribbon's drawn
 * opacity, and a player asking for cheaper weather asked for fewer things, not
 * fainter ones.
 */
const weatherScale = (
	scaling: VfxWeatherScaling,
	weather: WeatherFrame,
): number =>
	vfxWeatherInfluence(scaling, weather) *
	(isWeatherDriven(scaling) ? weatherParticleScale() : 1);

/**
 * A part's particles per second this frame: its authored rate, the emitter's
 * per-instance scale, and the live weather.
 */
const emissionRate = (
	part: VfxEmitterPart,
	rateScale: number,
	weather: WeatherFrame,
): number =>
	part.rate * rateScale * weatherScale(part.weather, weather);
