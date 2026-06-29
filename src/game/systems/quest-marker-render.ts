import {
	SpriteComponent,
	spriteImageUrl,
	spriteSource,
} from "../../engine/components/sprite";
import { TransformComponent } from "../../engine/components/transform";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import QuestMarkerTag, { QuestComponent } from "../components/quest";
import { getQuest } from "../quest/loader";

const HALF_WIDTH = 5;
const HEIGHT = 6;
const GAP = 6;
const BOB_SPEED = 4;
const BOB_AMOUNT = 2;
const FILL: [number, number, number, number] = [1, 0.85, 0.4, 1];
const OUTLINE: [number, number, number, number] = [0, 0, 0, 1];

export class QuestMarkerDrawerSystem implements RenderSystem {
	private layer: number;

	constructor(layer: number) {
		this.layer = layer;
	}

	render({ renderer, ecs, assetManager, time }: RenderContext): void {
		const tags = this.activeTags(ecs);
		if (tags.size === 0) {
			return;
		}
		const bob = Math.sin(time.elapsed * BOB_SPEED) * BOB_AMOUNT;
		for (const [id, _, transform] of ecs.query(
			QuestMarkerTag,
			TransformComponent,
		)) {
			// TODO: Check if marker questid and stage are both active
			let half = 0;
			const sprite = ecs.getComponent(id, SpriteComponent);
			if (sprite) {
				const image = assetManager.getImage(spriteImageUrl(sprite));
				if (image) {
					const source = spriteSource(sprite, image);
					half = (source.height * transform.scale.y) / 2;
				}
			}
			const cx = transform.position.x;
			const apexY = transform.position.y - half - GAP - bob;
			const baseY = apexY - HEIGHT;
			this.chevron(renderer, cx, baseY, apexY, 4, OUTLINE);
			this.chevron(renderer, cx, baseY, apexY, 2, FILL);
		}
	}

	private chevron(
		renderer: RenderContext["renderer"],
		cx: number,
		baseY: number,
		apexY: number,
		width: number,
		color: [number, number, number, number],
	): void {
		renderer.drawLine(
			this.layer,
			cx - HALF_WIDTH,
			baseY,
			cx,
			apexY,
			color,
			width,
		);
		renderer.drawLine(
			this.layer,
			cx + HALF_WIDTH,
			baseY,
			cx,
			apexY,
			color,
			width,
		);
	}

	private activeTags(ecs: RenderContext["ecs"]): Set<string> {
		const tags = new Set<string>();
		for (const [, quest] of ecs.query(QuestComponent)) {
			const def = getQuest(quest.id);
			if (!def) {
				continue;
			}
			for (const objective of def.objectives) {
				if (objective.activeInStage === quest.stage) {
					tags.add(objective.tag);
				}
			}
		}
		return tags;
	}
}
