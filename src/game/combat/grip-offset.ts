import type {
	BspritePoint,
	BspriteRect,
} from "../../engine/sprite/bsprite-manifest";
import type { ReadonlyVector2 } from "../../engine/vector2";

/**
 * Convert a `.bsprite` attachment point — a pixel in full-canvas space — into a
 * world-space offset from the sprite's `transform.position`.
 *
 * The engine anchors a `.bsprite` sprite by drawing the active tag's **content
 * rect centered on `transform.position`**, scaled by `transform.scale` (see
 * `sprite-render-system.ts` + `renderer-2d.ts`'s center-anchored `drawImage`).
 * So the canvas pixel that lands exactly on `transform.position` is the content
 * rect's center; any point's world offset is its pixel distance from that center
 * times the per-axis scale. The engine's y axis runs **down**, matching canvas
 * +y ({@link import("../../engine/vector2").default.down} is `(0, 1)`), so y is
 * not flipped.
 *
 * `point` is the **authored, unmirrored** attachment (the facade's
 * `attachment(name, frame)` no longer pre-mirrors). Mirroring for a left-facing
 * sprite is done **here**, about the content-rect center, by negating the x
 * offset when `flipX` is set. This is consistent with rendering by construction:
 * the drawn content rect is mirrored about its own center, so a point at pixel
 * offset `d` right of center maps to offset `-d` when facing left. Mirroring
 * about the canvas center instead (the old `width - x`) is off by
 * `width - 2·contentCenterX` whenever the content rect is not canvas-centered.
 *
 * @example
 * const point = asset.attachment("grip", sprite.frame);
 * if (point) {
 *   const off = attachmentWorldOffset(
 *     point,
 *     asset.contentRect(sprite.current),
 *     transform.scale,
 *     sprite.flipX,
 *   );
 *   bow.renderPosition.set(
 *     transform.position.x + off.x,
 *     transform.position.y + off.y,
 *   );
 * }
 */
export const attachmentWorldOffset = (
	point: BspritePoint,
	content: BspriteRect,
	scale: ReadonlyVector2,
	flipX = false,
): Readonly<{ x: number; y: number }> => {
	const centerX = content.x + content.width / 2;
	const centerY = content.y + content.height / 2;
	const offsetX = (point.x - centerX) * scale.x;
	return {
		x: flipX ? -offsetX : offsetX,
		y: (point.y - centerY) * scale.y,
	};
};
