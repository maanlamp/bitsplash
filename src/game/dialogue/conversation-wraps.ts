import type AssetManager from "../../engine/assets";
import type { LoadedFont } from "../../engine/load";
import type { TileSource } from "../../engine/render/renderer-2d";
import type { SpriteTag } from "../../engine/sprite/sprite-tag";
import type { FontSettings } from "../../engine/text/font-settings";
import {
	parseRichText,
	type RichLine,
	wrapRichText,
} from "../../engine/text/rich-text";
import { resolveFont } from "../../engine/text/resolve-font";
import {
	characterById,
	PORTRAIT_SHEET_URL,
} from "../character/character-descriptor";
import { resolveEmotionIcon } from "../reaction/resolve-emotion-icon";
import type { ConversationComponent } from "./conversation-component";
import {
	messageBubbleId,
	messageGlyphsId,
} from "./conversation-nodes";
import {
	BUBBLE_MAX_TEXT_WIDTH,
	type ChoiceView,
	type MessageView,
	type PortraitFrame,
} from "./conversation-view";
import { conversationWindow } from "./conversation-window";
import { messageMarkup } from "./message";

/**
 * Resolve the portrait crop for a character's `.bsprite` tag: the composed sheet
 * plus the tag's first frame offset into it, in the same convention as
 * `SpriteSource`. `null` while the archive is still loading, so the portrait box
 * simply renders empty and the row never reflows.
 */
const resolvePortrait = (
	assetManager: AssetManager,
	tag: SpriteTag,
): PortraitFrame | null => {
	const asset = assetManager.sprites.get(PORTRAIT_SHEET_URL);
	if (!asset) {
		return null;
	}
	const frame =
		asset.spriteManifest?.tags.find((entry) => entry.name === tag)
			?.from ?? 0;
	const rect = asset.contentRect(tag);
	return {
		image: asset.image,
		x: frame * asset.width + rect.x,
		y: rect.y,
		width: rect.width,
		height: rect.height,
	};
};

type WrapEntry = Readonly<{
	source: string;
	font: LoadedFont;
	lines: readonly RichLine[];
}>;

/**
 * Wraps the visible messages and choices at {@link BUBBLE_MAX_TEXT_WIDTH},
 * caching each wrap so the lines a `MessageView` carries keep their identity
 * frame to frame — the HUD snapshot compares views by reference, so a fresh wrap
 * every frame would re-render React every frame.
 *
 * Text is wrapped lazily, only for what the window shows: the transcript stores
 * raw text so it can be appended to while fast-forwarding, before any font has
 * loaded.
 *
 * @example
 * const wraps = new ConversationWraps();
 * const views = wraps.messageViews(conversation, assetManager, presentedIndex);
 */
export class ConversationWraps {
	private readonly messages = new Map<number, WrapEntry>();
	private readonly choices = new Map<number, WrapEntry>();
	private readonly portraits = new Map<string, PortraitFrame>();
	private sheet: TileSource | null = null;

	/**
	 * One view per visible message, oldest first. Empty while the fonts the
	 * visible messages need are still loading — a partly-wrapped window would pop
	 * bubbles in as fonts arrived.
	 */
	messageViews(
		conversation: ConversationComponent,
		assetManager: AssetManager,
		presentedIndex: number,
	): readonly MessageView[] {
		const indices = conversationWindow(
			conversation.cursor,
			conversation.messages.length,
		);
		const out: MessageView[] = [];
		for (const index of indices) {
			const message = conversation.messages[index]!;
			const { font, portrait } = characterById(message.characterId);
			const wrap = this.wrap(
				this.messages,
				index,
				messageMarkup(message),
				font,
				assetManager,
			);
			if (!wrap) {
				return [];
			}
			out.push({
				index,
				message,
				lines: wrap.lines,
				loadedFont: wrap.font,
				portrait: this.portraitFor(assetManager, portrait),
				emotionIcon: resolveEmotionIcon(
					assetManager,
					message.emotion,
				),
				bubbleId: messageBubbleId(index),
				...(index === presentedIndex
					? { glyphsId: messageGlyphsId(index) }
					: null),
			});
		}
		return out;
	}

	/**
	 * One view per pending choice, in ink's option order. Empty until every
	 * choice's font has loaded, so the list never appears a row at a time.
	 */
	choiceViews(
		texts: readonly string[],
		selected: number,
		font: FontSettings,
		assetManager: AssetManager,
	): readonly ChoiceView[] {
		const out: ChoiceView[] = [];
		for (let index = 0; index < texts.length; index++) {
			const wrap = this.wrap(
				this.choices,
				index,
				texts[index]!,
				font,
				assetManager,
			);
			if (!wrap) {
				return [];
			}
			out.push({
				index,
				lines: wrap.lines,
				font,
				selected: index === selected,
			});
		}
		return out;
	}

	/** Drop every cached wrap — a conversation's indices start over at zero. */
	reset(): void {
		this.messages.clear();
		this.choices.clear();
	}

	/**
	 * Portrait crops are cached per tag so a view keeps the same frame object
	 * frame to frame; the cache is dropped whole when the sheet itself changes,
	 * which is the only thing that can invalidate a crop.
	 */
	private portraitFor(
		assetManager: AssetManager,
		tag: SpriteTag,
	): PortraitFrame | null {
		const resolved = resolvePortrait(assetManager, tag);
		if (!resolved) {
			return null;
		}
		if (this.sheet !== resolved.image) {
			this.sheet = resolved.image;
			this.portraits.clear();
		}
		const cached = this.portraits.get(tag);
		if (cached) {
			return cached;
		}
		this.portraits.set(tag, resolved);
		return resolved;
	}

	private wrap(
		cache: Map<number, WrapEntry>,
		key: number,
		source: string,
		settings: FontSettings,
		assetManager: AssetManager,
	): WrapEntry | null {
		const font = resolveFont(settings, assetManager);
		if (!font) {
			return null;
		}
		const cached = cache.get(key);
		if (cached && cached.source === source && cached.font === font) {
			return cached;
		}
		const entry: WrapEntry = {
			source,
			font,
			lines: wrapRichText(
				font,
				parseRichText(source),
				BUBBLE_MAX_TEXT_WIDTH,
			),
		};
		cache.set(key, entry);
		return entry;
	}
}
