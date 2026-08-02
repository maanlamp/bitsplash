import type { MutableRGBA } from "../animation/keyframes";
import type { QuadBlend } from "./blend";
import type Renderer2D from "./renderer-2d";

/**
 * How a ribbon's width and colour vary along its arc length.
 *
 * Both are sampled at `t`, the normalized distance travelled along the
 * polyline — `0` at the first point, `1` at the last — so a profile is
 * independent of how many points the path happens to have.
 *
 * `tint` writes into `out` rather than returning a tuple, matching
 * `KeyframesColor.sampleInto`, so sampling a colour allocates nothing and a
 * colour track plugs straight in. Alpha rides in `out[3]`, and `out` arrives
 * reset to opaque white, so a profile need only write what it varies.
 */
export type RibbonProfile = Readonly<{
	/** World-unit total width at `t`; values below zero are treated as zero. */
	width: (t: number) => number;
	tint: (t: number, out: MutableRGBA) => void;
}>;

/** The polyline and profile {@link drawRibbon} turns into a quad chain. */
export type RibbonOpts = Readonly<{
	/** X of each point, in path order. */
	px: ReadonlyArray<number>;
	/** Y of each point, in path order, world y pointing down. */
	py: ReadonlyArray<number>;
	profile: RibbonProfile;
	blend?: QuadBlend;
}>;

/** Consecutive points closer than this world distance are one point. */
const COINCIDENT = 1e-6;

/**
 * Emit a polyline as a chain of untextured quads, one per segment, widened
 * about the path and coloured from its profile.
 *
 * Pure geometry: it knows nothing of particles, emitters, weather or time, so
 * every path generator — wind lines, bolts, beams, helices — shares it and
 * differs only in the points it hands over.
 *
 * Joints use the **averaged** segment normal without a miter extension, so a
 * sharp corner pinches rather than spiking to infinity, and a path that doubles
 * back on itself stays finite. Degenerate input draws nothing: fewer than two
 * distinct points, or a path of zero total length.
 *
 * Colour is sampled once per segment, at the segment's midpoint, because a quad
 * carries one tint. Subdivide the path for a steeper gradient.
 *
 * @example
 * drawRibbon(renderer, layer, {
 *   px, py,
 *   profile: { width: (t) => 6 * (1 - t), tint: (t, out) => { out[3] = 1 - t; } },
 *   blend: "additive",
 * });
 */
export const drawRibbon = (
	renderer: Renderer2D,
	layer: number,
	{ px, py, profile, blend }: RibbonOpts,
): void => {
	const xs: number[] = [];
	const ys: number[] = [];
	const along: number[] = [];
	const count = Math.min(px.length, py.length);
	let total = 0;
	for (let i = 0; i < count; i++) {
		const x = px[i]!;
		const y = py[i]!;
		const last = xs.length - 1;
		if (last >= 0) {
			const step = Math.hypot(x - xs[last]!, y - ys[last]!);
			if (step <= COINCIDENT) {
				continue;
			}
			total += step;
		}
		xs.push(x);
		ys.push(y);
		along.push(total);
	}
	if (xs.length < 2 || total === 0) {
		return;
	}

	const n = xs.length;
	const nx: number[] = [];
	const ny: number[] = [];
	let prevX = 0;
	let prevY = 0;
	for (let i = 0; i < n - 1; i++) {
		const len = along[i + 1]! - along[i]!;
		const segX = -(ys[i + 1]! - ys[i]!) / len;
		const segY = (xs[i + 1]! - xs[i]!) / len;
		if (i === 0) {
			nx.push(segX);
			ny.push(segY);
		} else {
			const ax = prevX + segX;
			const ay = prevY + segY;
			const mag = Math.hypot(ax, ay);
			const doubledBack = mag <= COINCIDENT;
			nx.push(doubledBack ? prevX : ax / mag);
			ny.push(doubledBack ? prevY : ay / mag);
		}
		prevX = segX;
		prevY = segY;
	}
	nx.push(prevX);
	ny.push(prevY);

	const tint: MutableRGBA = [1, 1, 1, 1];
	const qx: number[] = [0, 0, 0, 0];
	const qy: number[] = [0, 0, 0, 0];
	for (let i = 0; i < n - 1; i++) {
		const t0 = along[i]! / total;
		const t1 = along[i + 1]! / total;
		const h0 = Math.max(0, profile.width(t0)) / 2;
		const h1 = Math.max(0, profile.width(t1)) / 2;
		qx[0] = xs[i]! + nx[i]! * h0;
		qy[0] = ys[i]! + ny[i]! * h0;
		qx[1] = xs[i + 1]! + nx[i + 1]! * h1;
		qy[1] = ys[i + 1]! + ny[i + 1]! * h1;
		qx[2] = xs[i + 1]! - nx[i + 1]! * h1;
		qy[2] = ys[i + 1]! - ny[i + 1]! * h1;
		qx[3] = xs[i]! - nx[i]! * h0;
		qy[3] = ys[i]! - ny[i]! * h0;
		tint[0] = 1;
		tint[1] = 1;
		tint[2] = 1;
		tint[3] = 1;
		profile.tint((t0 + t1) / 2, tint);
		renderer.drawCornerQuad(layer, {
			px: qx,
			py: qy,
			tint,
			blend,
		});
	}
};
