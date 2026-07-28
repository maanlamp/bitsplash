export type QuestObjective = Readonly<{
	activeInStage: string;
	type: "killTagged" | "collectTagged";
	tag: string;
	count: number;
	objectiveText: string;
	onComplete: Readonly<{ type: "advanceStage"; to: string }>;
}>;

export type QuestReward = Readonly<{
	onStage: string;
	type: string;
	itemId?: string;
	count?: number;
	ability?: string;
}>;

export type QuestDef = Readonly<{
	id: string;
	name: string;
	fsm: string;
	objectives: QuestObjective[];
	rewards: QuestReward[];
	stageObjectives?: Record<string, string>;
	stageNotices?: Record<string, string>;
}>;

let modules: Record<string, { default: QuestDef }> = {};
try {
	modules = import.meta.glob("../content/quests/*.json", {
		eager: true,
	}) as Record<string, { default: QuestDef }>;
} catch {
	modules = {};
}

const quests = new Map<string, QuestDef>();
for (const mod of Object.values(modules)) {
	quests.set(mod.default.id, mod.default);
}

export const getQuest = (id: string): QuestDef | null =>
	quests.get(id) ?? null;

/**
 * Register an authored quest def outside the `import.meta.glob` sweep, which is
 * a Vite transform and so yields nothing under Bun. Lets a headless test feed
 * the committed `*.json` artifact straight in.
 *
 * @example
 * import massacre from "../src/game/content/quests/massacre.json";
 * registerQuest(massacre as QuestDef);
 */
export const registerQuest = (def: QuestDef): void => {
	quests.set(def.id, def);
};
