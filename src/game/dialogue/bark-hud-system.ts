import type AssetManager from "../../engine/assets";
import type { EntityId } from "../../engine/ecs";
import { entityTop } from "../../engine/sprite/entity-top";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { FontSettings } from "../../engine/text/font-settings";
import { resolveFont } from "../../engine/text/resolve-font";
import {
	parseRichText,
	wrapRichText,
} from "../../engine/text/rich-text";
import { TransformComponent } from "../../engine/transform-component";
import type { DynStore } from "../../engine/ui/bypass/dyn-store";
import { findById } from "../../engine/ui/input/node-tree";
import type { UiRoot } from "../../engine/ui/reconciler/ui-root";
import { emotionStackHeight } from "../reaction/emotion-icon-hud-system";
import { BarkComponent } from "./bark-component";
import {
	barkBubbleScale,
	barkFontSize,
	barkNodeId,
	barkWrapWidth,
} from "./bark-hud";
import type { BarkHudState, BarkView } from "./bark-hud-state";
import {
	type BubbleFrame,
	resolveBubbleFrame,
	UNLOADED_BUBBLE_FRAME,
} from "./bubble-frame";

type Placement = Readonly<{
	entity: EntityId;
	worldX: number;
	worldY: number;
}>;

const fontKey = (font: FontSettings, size: number): string =>
	`${font.fontRef.path}@${size}@${font.variant}@${font.family}`;

/**
 * Keeps one bark bubble in the UI tree per barking entity and places each one
 * above its speaker's head.
 *
 * This runs in the **render** phase, ahead of the UI paint system, for two
 * reasons that both come from measurement. A bubble positions itself against its
 * own measured `layoutRect` — centred on the speaker, sitting above the art — and
 * that rect only exists once `ui.layout` has run, which is after the update
 * phase. And the scale a bark lays out at is derived from `uiScale`, which only
 * {@link RenderContext} carries. Placing a bubble the frame it mounts therefore
 * costs one frame of layout: the paint pass skips a node that has no rect yet,
 * and skips one that has a dyn offset but no measured width, so a bubble never
 * flashes at the wrong place.
 */
export class BarkHudSystem implements RenderSystem {
	private readonly views = new Map<EntityId, BarkView>();
	private readonly fonts = new Map<string, FontSettings>();
	private frame: BubbleFrame = UNLOADED_BUBBLE_FRAME;

	constructor(
		private readonly store: BarkHudState,
		private readonly root: UiRoot,
		private readonly dyn: DynStore,
	) {}

	render({
		ecs,
		assetManager,
		uiScale,
		camera,
	}: RenderContext): void {
		const frame = this.currentFrame(assetManager);
		const scale = barkBubbleScale(camera?.zoom ?? 1, uiScale);
		const views: BarkView[] = [];
		const placements: Placement[] = [];
		const live = new Set<EntityId>();

		for (const [id, bark, transform] of ecs.query(
			BarkComponent,
			TransformComponent,
		)) {
			if (bark.text.length === 0) {
				continue;
			}
			const view = this.viewFor(id, bark, assetManager, frame, scale);
			if (!view) {
				continue;
			}
			live.add(id);
			views.push(view);
			const gap = bark.offset + emotionStackHeight(ecs, id);
			placements.push({
				entity: id,
				worldX: transform.position.x,
				worldY:
					entityTop(ecs, assetManager, id, gap) ??
					transform.position.y - gap,
			});
		}

		for (const id of this.views.keys()) {
			if (!live.has(id)) {
				this.views.delete(id);
			}
		}
		this.store.setViews(views);

		for (const placement of placements) {
			this.place(placement);
		}
	}

	/**
	 * The bubble frame, held by identity so a view is only rebuilt when the
	 * `.bsprite` actually finishes loading — {@link resolveBubbleFrame} returns a
	 * fresh object every call.
	 */
	private currentFrame(assetManager: AssetManager): BubbleFrame {
		const next = resolveBubbleFrame(assetManager);
		if (
			next.image === this.frame.image &&
			next.insets === this.frame.insets
		) {
			return this.frame;
		}
		this.frame = next;
		return next;
	}

	/**
	 * The cached view for `id`, rebuilt only when its text, its font pairing or
	 * the bubble frame changes. Returns `null` while the font is still loading,
	 * which happens for a frame or two after a new size is first asked for.
	 *
	 * The view's scale is the **quantized** one — the ratio the rounded font size
	 * actually landed on — so a camera gliding between zooms rebuilds a view only
	 * when the type size steps, not every frame.
	 */
	private viewFor(
		id: EntityId,
		bark: BarkComponent,
		assetManager: AssetManager,
		frame: BubbleFrame,
		scale: number,
	): BarkView | null {
		const font = this.scaledFont(bark.font, scale);
		const loadedFont = resolveFont(font, assetManager);
		if (!loadedFont) {
			return null;
		}
		const quantized =
			bark.font.size > 0 ? font.size / bark.font.size : scale;
		const cached = this.views.get(id);
		if (
			cached &&
			cached.text === bark.text &&
			cached.font === font &&
			cached.loadedFont === loadedFont &&
			cached.frame === frame &&
			cached.scale === quantized
		) {
			return cached;
		}
		const view: BarkView = {
			entity: id,
			text: bark.text,
			lines: wrapRichText(
				loadedFont,
				parseRichText(bark.text),
				barkWrapWidth(quantized),
			),
			font,
			loadedFont,
			frame,
			scale: quantized,
		};
		this.views.set(id, view);
		return view;
	}

	/**
	 * `settings` at the bark's layout scale, shared between every bark using the
	 * same typeface so the asset manager is asked for one size and React sees one
	 * stable style object.
	 */
	private scaledFont(
		settings: FontSettings,
		scale: number,
	): FontSettings {
		const size = barkFontSize(settings.size, scale);
		const key = fontKey(settings, size);
		const cached = this.fonts.get(key);
		if (cached) {
			return cached;
		}
		const font = new FontSettings(
			settings.fontRef.path,
			size,
			settings.variant,
			settings.family,
		);
		this.fonts.set(key, font);
		return font;
	}

	/**
	 * Anchors the bubble's tail tip at the speaker's overhead point, shifting the
	 * node left by half its measured width and up by its full measured height.
	 */
	private place({ entity, worldX, worldY }: Placement): void {
		const node = findById(this.root.tree, barkNodeId(entity));
		const rect = node?.layoutRect;
		if (!node || !rect) {
			return;
		}
		this.dyn.set(node.id, {
			worldX,
			worldY,
			offsetX: -rect.w / 2,
			offsetY: -rect.h,
		});
	}
}
