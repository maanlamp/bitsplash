export type QuestObjective = Readonly<{
	activeInStage: string;
	type: "killTagged";
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

const modules = import.meta.glob("../quests/*.json", {
	eager: true,
}) as Record<string, { default: QuestDef }>;

const quests = new Map<string, QuestDef>();
for (const mod of Object.values(modules)) {
	quests.set(mod.default.id, mod.default);
}

export const getQuest = (id: string): QuestDef | null =>
	quests.get(id) ?? null;
