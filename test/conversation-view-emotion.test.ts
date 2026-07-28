import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";
import AssetManager from "../src/engine/assets";
import { decodePng } from "../src/editor/sprite/png-codec";
import { characterById } from "../src/game/character/character-descriptor";
import { ConversationComponent } from "../src/game/dialogue/conversation-component";
import { ConversationWraps } from "../src/game/dialogue/conversation-wraps";
import { Message } from "../src/game/dialogue/message";
import { EMOTION_CELLS } from "../src/game/reaction/emotion-icon-atlas";
import { EMOTION_ICON_SHEET_URL } from "../src/game/reaction/resolve-emotion-icon";
import {
	settleAssets,
	useDiskFetch,
} from "./support/sequence-harness";

/**
 * The seam between the reaction slice's icon atlas and the dialogue panel: a
 * `MessageView` must carry the resolved icon for its message's `# emotion:` tag,
 * because the portrait badge is the only thing that reads it.
 */

const ATLAS_PATH = "/src/game/content/assets/emotions.icons.png";
const SPEAKER = "bramble";

/**
 * An {@link AssetManager} serving the committed atlas — with only the DOM-bound
 * decode replaced, the seam `emotion-icon-assets.test.ts` uses — plus the real
 * `.font.zip` off disk, without which `messageViews` withholds every row.
 */
const assets = async (): Promise<AssetManager> => {
	const decoded = decodePng(
		new Uint8Array(
			readFileSync(`${import.meta.dir}/..${ATLAS_PATH}`),
		),
	);
	const manager = new AssetManager(
		async () =>
			({
				width: decoded.width,
				height: decoded.height,
			}) as unknown as HTMLImageElement,
	);
	manager.getImage(EMOTION_ICON_SHEET_URL);
	const { font } = characterById(SPEAKER);
	manager.getFontFamilies(font.fontRef.path, font.size);
	await settleAssets();
	return manager;
};

const conversation = (
	emotion: "happy" | null,
): ConversationComponent => {
	const c = new ConversationComponent(3);
	c.messages.push(
		new Message(SPEAKER, "Embers do not wink.", emotion, "speech"),
	);
	c.cursor = 0;
	return c;
};

test("a message's emotion reaches its view as a resolved atlas cell", async () => {
	const restore = useDiskFetch();
	try {
		const views = new ConversationWraps().messageViews(
			conversation("happy"),
			await assets(),
			0,
		);

		expect(views).toHaveLength(1);
		expect(views[0]!.emotionIcon).toEqual({
			image: expect.anything(),
			...EMOTION_CELLS.happy,
		});
	} finally {
		restore();
	}
});

test("a message with no emotion carries no icon, so no badge is drawn", async () => {
	const restore = useDiskFetch();
	try {
		const views = new ConversationWraps().messageViews(
			conversation(null),
			await assets(),
			0,
		);

		expect(views).toHaveLength(1);
		expect(views[0]!.emotionIcon).toBeNull();
	} finally {
		restore();
	}
});
