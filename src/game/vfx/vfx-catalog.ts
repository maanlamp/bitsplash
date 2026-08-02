import { registerVfxCatalog } from "../../engine/vfx/vfx-registry";
import leavesJson from "../content/vfx/leaves.vfx.json";
import rainHeavyJson from "../content/vfx/rain-heavy.vfx.json";
import rainSplashJson from "../content/vfx/rain-splash.vfx.json";
import rainJson from "../content/vfx/rain.vfx.json";
import sandJson from "../content/vfx/sand.vfx.json";
import snowJson from "../content/vfx/snow.vfx.json";
import windLinesJson from "../content/vfx/wind-lines.vfx.json";
import { VFX_DEF_IDS, type VfxDefId } from "./vfx-ids";

/**
 * Registers the game's effect catalog with the engine, which is what turns the
 * particle systems on at all — `hasVfxDefs()` is false and every VFX system
 * no-ops until this module has run.
 *
 * Static JSON imports keyed off {@link VFX_DEF_IDS} rather than
 * `import.meta.glob`: the record's key type is {@link VfxDefId}, so a new member
 * of the tuple with no matching import is a `tsc` error, and the catalog loads
 * identically under Vite and under `bun test`, where `import.meta.glob` throws.
 *
 * The engine validates each def's contents and the catalog's cross-references.
 * What is checked here is the other direction — that a file's own `id` matches the
 * tuple entry it was imported for — so a def renamed on one side only fails at
 * load, naming the file, rather than surviving as a reference to nothing.
 */
const SOURCE = "src/game/content/vfx";

const DEFS: Readonly<Record<VfxDefId, unknown>> = {
	rain: rainJson,
	"rain-heavy": rainHeavyJson,
	"rain-splash": rainSplashJson,
	snow: snowJson,
	sand: sandJson,
	"wind-lines": windLinesJson,
	leaves: leavesJson,
};

/**
 * Validate the authored defs against the shipped id tuple and install them.
 * Idempotent and safe to call again — tests that swap in a fixture catalog use it
 * to put the real one back.
 */
export const registerVfxContent = (): void => {
	for (const id of VFX_DEF_IDS) {
		const authored = DEFS[id] as { id?: unknown };
		if (authored.id !== id) {
			throw new Error(
				`${SOURCE}/${id}.vfx.json: declares def id ${JSON.stringify(authored.id)} but is registered as "${id}". A def's id is its filename; rename both or neither.`,
			);
		}
	}
	registerVfxCatalog(
		VFX_DEF_IDS.map((id) => DEFS[id]),
		SOURCE,
	);
};

registerVfxContent();
