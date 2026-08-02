import { Color } from "../color";
import {
	serializable,
	serialize,
} from "../serialization/serializable";

/** The demo scene's daylight blue — the default a new sky is authored at. */
const DEFAULT_SKY_CSS = "oklch(0.752 0.1204 204.04 / 1)";

/**
 * The colour the sky was authored at, before weather touches it.
 *
 * Replaces the removed `SceneConfig.clearColor`: the sky is content a level
 * author places and edits like anything else, not a render setting, and making
 * it a component is what lets the weather tint it per frame
 * ({@link skyTintInto}) without any of that tint being representable in the
 * scene file. A scene with no `SkyComponent` has no sky and clears transparent
 * — the right answer for an interior or a UI-only scene, and exactly what
 * `clearColor`'s `Color("transparent")` default did.
 *
 * **Solid colour only.** Gradients and parallax bands are deliberately out of
 * scope; they would join here as further authored fields read by the same
 * render system, and nothing about this shape forecloses them.
 *
 * @example
 * ```ts
 * const sky = new SkyComponent();
 * sky.color.set("oklch(0.752 0.1204 204.04 / 1)");
 * ecs.createEntity([sky]);
 * ```
 */
@serializable("Sky")
export class SkyComponent {
	/**
	 * The authored sky colour. Defaults to the demo scene's daylight blue, so a
	 * sky dropped into a fresh scene reads as a sky immediately.
	 */
	@serialize() color = new Color(DEFAULT_SKY_CSS);
}
