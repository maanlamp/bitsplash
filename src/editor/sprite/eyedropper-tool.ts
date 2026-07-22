import { rgbToOklch } from "../color/oklch";
import type {
	SpriteTool,
	ToolContext,
	ToolSession,
} from "./tool-strategy";
import type { CursorValue } from "../../engine/cursor/cursor-authority";

/**
 * The eyedropper: samples the composite (what-you-see) colour under the cursor
 * into the editor's active colour. A primary press picks, and a drag keeps
 * picking so you can scrub to the colour you want; the release ends the gesture.
 *
 * It is reachable both as its own tool and by holding Alt (a temporary-tool
 * push, like hold-Space for pan). Sampling goes through
 * {@link ToolContext.sample}, so it reads the true composite on both the texture
 * view and the tileset paint-through view.
 */
export class EyedropperTool implements SpriteTool {
	readonly id = "eyedropper" as const;

	private pick(ctx: ToolContext): void {
		const rgba = ctx.sample(ctx.x, ctx.y);
		if (!rgba) {
			return;
		}
		const [r, g, b, a] = rgba;
		const { l, c, h } = rgbToOklch(r, g, b);
		ctx.state.setColor({ l, c, h, alpha: a / 255 });
	}

	onDown(ctx: ToolContext, session: ToolSession): void {
		if (ctx.button !== 0 || !ctx.overImage) {
			return;
		}
		session.active = true;
		ctx.capture();
		this.pick(ctx);
	}

	onMove(ctx: ToolContext, session: ToolSession): void {
		if (!session.active) {
			return;
		}
		this.pick(ctx);
	}

	onUp(_ctx: ToolContext, session: ToolSession): void {
		session.active = false;
	}

	onCancel(_ctx: ToolContext, session: ToolSession): void {
		session.active = false;
	}

	cursor(overImage: boolean): CursorValue {
		return overImage ? "crosshair" : "default";
	}
}
