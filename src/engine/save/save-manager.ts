import type { Runtime } from "../runtime/runtime";
import {
	decodeEnvelope,
	encodeEnvelope,
	type Envelope,
	migrateEnvelope,
	SAVE_VERSION,
} from "./save-envelope";
import type { SaveBlob } from "./save-store";

export class SaveManager {
	capture(runtime: Runtime, savedAt: number): Promise<SaveBlob> {
		const state = runtime.snapshot();
		const envelope: Envelope = {
			version: SAVE_VERSION,
			savedAt,
			activeSceneId: state.activeSceneId,
			persistent: state.persistent,
			scenes: state.scenes,
		};
		return encodeEnvelope(envelope);
	}

	async restore(runtime: Runtime, blob: SaveBlob): Promise<Envelope> {
		const envelope = this.migrate(await decodeEnvelope(blob));
		runtime.restore({
			activeSceneId: envelope.activeSceneId,
			persistent: envelope.persistent,
			scenes: envelope.scenes,
		});
		return envelope;
	}

	migrate(raw: unknown): Envelope {
		return migrateEnvelope(raw);
	}
}
