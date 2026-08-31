import type { SceneFile } from "../scene/scene";
import type { SerializedEntity } from "../serialization/registry";
import { encodeComponents } from "../serialization/serialize";
import { SkyComponent } from "./sky-component";

/**
 * Pure `SceneFile → SceneFile` migration upgrading a legacy scene's
 * `config.clearColor` into a {@link SkyComponent} entity.
 *
 * When the file names a clear colour, a sky carrying that colour is appended to
 * `entities` with an id derived deterministically from the scene id
 * (`${sceneId}:sky`) so repeated opens produce byte-identical baselines, and
 * the legacy field is dropped from the config so the sky has exactly one home.
 * Idempotent by construction: the field it reads is the field it removes. A
 * file that already declares a sky keeps it and only sheds the stale field, so
 * a hand-reintroduced `clearColor` can never mint a second sky.
 *
 * A file with no clear colour is returned unchanged and gains no sky — a scene
 * that never authored one still clears transparent, which is what `clearColor`
 * defaulted to.
 *
 * @example
 * const migrated = migrateSky(file, "demo");
 */
export const migrateSky = (
	file: SceneFile,
	sceneId: string,
): SceneFile => {
	const { clearColor, ...config } = file.config;
	if (clearColor === undefined) {
		return file;
	}
	if (file.entities.some((entity) => "Sky" in entity.components)) {
		return { ...file, config };
	}
	const sky = new SkyComponent();
	sky.color.set(clearColor);
	const entity: SerializedEntity = {
		id: `${sceneId}:sky`,
		components: encodeComponents([sky]),
	};
	return {
		...file,
		config,
		entities: [...file.entities, entity],
	};
};
