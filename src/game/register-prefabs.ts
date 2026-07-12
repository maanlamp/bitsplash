import { type PrefabDefinition, registerPrefab } from "./prefabs";

const modules = import.meta.glob("./content/prefabs/*.json", {
	eager: true,
}) as Record<string, { default: PrefabDefinition }>;

for (const [path, mod] of Object.entries(modules)) {
	const name = path
		.split("/")
		.pop()!
		.replace(/\.json$/, "");
	registerPrefab(name, mod.default);
}
