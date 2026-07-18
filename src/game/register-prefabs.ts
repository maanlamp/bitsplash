import { type PrefabDefinition, registerPrefab } from "./prefabs";

const modules = import.meta.glob("./content/prefabs/*.prefab.json", {
	eager: true,
}) as Record<string, { default: PrefabDefinition }>;

for (const [path, mod] of Object.entries(modules)) {
	const name = path
		.split("/")
		.pop()!
		.replace(/\.prefab\.json$/, "");
	registerPrefab(name, mod.default);
}
