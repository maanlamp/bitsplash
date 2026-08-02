import type { Camera2D } from "../camera/camera-2d";
import type { Seconds } from "../duration";
import type { ECS, ReadonlyECS } from "../ecs";
import { profiler } from "../profiling/profiler";
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
import { sampleWind } from "../weather/sample-wind";
import {
	type WeatherFrame,
	weatherFrame,
} from "../weather/weather-frame";
import {
	EmitterComponent,
	readonlyEmitter,
} from "./emitter-component";
import type {
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
	private solidCells: Set<string> | null = null;
	private readonly blockingCells = new Map<
		TileBlockingClass,
		Set<string>
	>();
	private readonly shelter = new Map<
		TileBlockingClass,
		ExposureField
	>();
	private shelterCenterX = 0;
	private shelterCenterY = 0;
	private cameraCentreX: number | null = null;
	private cameraCentreY: number | null = null;
	private cameraCut = false;

	constructor(readonly store: VfxStore) {}

	update(ctx: UpdateContext): void {
		const { ecs } = ctx;
		this.installCleanupHook(ecs);
		if (!hasVfxDefs()) {
			return;
		}
		const dt = Math.min(Math.max(ctx.time.dt, 0), MAX_STEP);
		this.solidCells = null;
		this.blockingCells.clear();
		this.shelter.clear();
		this.shelterCenterX = ctx.camera?.position.x ?? 0;
		this.shelterCenterY = ctx.camera?.position.y ?? 0;
		this.cameraCut = this.detectCameraCut(ctx.camera);
		this.store.evict(ecs);
		this.syncEmitters(ctx, dt);
		const time = ambientTime(ecs);
		for (const effect of this.store.effects()) {
			this.advance(ecs, effect, dt, time);
		}
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
	private syncEmitters(ctx: UpdateContext, dt: number): void {
		const { ecs } = ctx;
		const weather = weatherFrame(ecs);
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
				this.start(ctx, effect, weather, config.rateScale);
			}
			effect.originX = originX;
			effect.originY = originY;
			effect.emitting = config.enabled;
			if (!effect.emitting) {
				continue;
			}
			for (const state of effect.parts) {
				if (state.kind === "ribbon") {
					this.topUpRibbons(
						ctx.camera,
						effect,
						state.part,
						state.band,
						weather,
						config.rateScale,
					);
					continue;
				}
				const { part, pool } = state;
				if (part.rate === 0) {
					continue;
				}
				pool.accumulator +=
					emissionRate(part, config.rateScale, weather) * dt;
				const count = Math.floor(pool.accumulator);
				if (count === 0) {
					continue;
				}
				pool.accumulator -= count;
				const origin = this.originFor(ctx.camera, effect, part);
				if (origin) {
					const before = pool.count;
					this.store.emit(pool, part, count, origin);
					this.cullSheltered(ecs, part, pool, before, effect);
				}
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
		if (shape.kind === "camera-band") {
			if (!camera) {
				return null;
			}
			const bounds = camera.visibleBounds();
			return {
				x: (bounds.min.x + bounds.max.x) / 2,
				y: bounds.min.y + shape.offsetY,
				spreadX: (bounds.max.x - bounds.min.x) * shape.widthScale,
				spreadY: shape.height,
				angle: 0,
			};
		}
		const local = part.space === "local";
		return {
			x: local ? 0 : effect.originX,
			y: local ? 0 : effect.originY,
			spreadX: shape.kind === "box" ? shape.width : 0,
			spreadY: shape.kind === "box" ? shape.height : 0,
			angle: 0,
		};
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
		if (part.origin === "camera") {
			if (!camera) {
				return null;
			}
			const bounds = camera.visibleBounds();
			return {
				x: this.store.between(bounds.min.x, bounds.max.x),
				y: this.store.between(bounds.min.y, bounds.max.y),
			};
		}
		const local = part.space === "local";
		return {
			x: local ? 0 : effect.originX,
			y: local ? 0 : effect.originY,
		};
	}

	/** Integrate, collide, and age one effect's parts. */
	private advance(
		ecs: ReadonlyECS,
		effect: VfxEffect,
		dt: number,
		time: Seconds,
	): void {
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
			const wind =
				part.wind === 0
					? 0
					: part.wind * sampleWind(ecs, baseX, time);
			const response =
				part.collision.mode === "tiles"
					? part.collision.response
					: "passThrough";
			const blocking = precipitationBlocking(part);
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
				const vx =
					pool.vx[i]! + (wind - part.drag * pool.vx[i]!) * dt;
				const vy =
					pool.vy[i]! + (part.gravity - part.drag * pool.vy[i]!) * dt;
				pool.vx[i] = vx;
				pool.vy[i] = vy;
				pool.x[i] = pool.x[i]! + vx * dt;
				pool.y[i] = pool.y[i]! + vy * dt;
				pool.rotation[i] = pool.rotation[i]! + pool.spin[i]! * dt;
				if (
					response !== "passThrough" &&
					pool.reacts(i) &&
					this.inBlockingCell(
						ecs,
						part,
						baseX + pool.x[i]!,
						baseY + pool.y[i]!,
					)
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
		const drift =
			part.wind === 0
				? 0
				: part.wind * sampleWind(ecs, baseX, time) * dt;
		let i = 0;
		while (i < band.count) {
			const age = band.age[i]! + dt;
			if (age >= band.life[i]!) {
				band.kill(i);
				continue;
			}
			band.age[i] = age;
			band.x[i] = band.x[i]! + drift;
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
	 * Whether a world point sits in a tile that stops this part, against the merged
	 * cell set its `collision.cells` classification names — built at most once per
	 * frame per classification, and only when some part actually collides.
	 *
	 * Rebuilt each frame rather than cached across frames: the version-keyed cache
	 * is a shared utility the blood workstream lands, and re-merging is still far
	 * cheaper than `isSolidCell`'s per-call layer query per particle.
	 */
	private inBlockingCell(
		ecs: ReadonlyECS,
		part: VfxEmitterPart,
		x: number,
		y: number,
	): boolean {
		const blocking = precipitationBlocking(part);
		const cells = blocking
			? this.cachedBlockingCells(ecs, blocking)
			: (this.solidCells ??= mergedSolidCells(ecs));
		return cells.has(
			tileCellKey(
				Math.floor(x / TILE_SIZE),
				Math.floor(y / TILE_SIZE),
			),
		);
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

	private cachedBlockingCells(
		ecs: ReadonlyECS,
		blocking: TileBlockingClass,
	): Set<string> {
		const cached = this.blockingCells.get(blocking);
		if (cached) {
			return cached;
		}
		const cells = mergedBlockingCells(ecs, blocking);
		this.blockingCells.set(blocking, cells);
		return cells;
	}
}

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
