import type { RuntimeState } from "../runtime/runtime";
import type { SaveBlob } from "./save-store";

export const SAVE_VERSION = 1;

export type Envelope = RuntimeState &
	Readonly<{
		version: number;
		savedAt: number;
	}>;

export type Upcaster = (
	doc: Record<string, unknown>,
) => Record<string, unknown>;

export const SAVE_MIGRATIONS: Record<number, Upcaster> = {};

const streamFrom = (bytes: Uint8Array): ReadableStream<Uint8Array> =>
	new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(bytes);
			controller.close();
		},
	});

const collect = async (
	stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> =>
	new Uint8Array(await new Response(stream).arrayBuffer());

type BytePair = ReadableWritablePair<Uint8Array, Uint8Array>;

const gzip = (bytes: Uint8Array): Promise<Uint8Array> =>
	collect(
		streamFrom(bytes).pipeThrough(
			new CompressionStream("gzip") as unknown as BytePair,
		),
	);

const gunzip = (bytes: SaveBlob): Promise<Uint8Array> =>
	collect(
		streamFrom(bytes).pipeThrough(
			new DecompressionStream("gzip") as unknown as BytePair,
		),
	);

export const encodeEnvelope = (
	envelope: Envelope,
): Promise<SaveBlob> =>
	gzip(new TextEncoder().encode(JSON.stringify(envelope)));

export const decodeEnvelope = async (
	blob: SaveBlob,
): Promise<unknown> =>
	JSON.parse(new TextDecoder().decode(await gunzip(blob)));

export const migrateEnvelope = (raw: unknown): Envelope => {
	if (typeof raw !== "object" || raw === null) {
		throw new Error("save: cannot migrate a non-object envelope");
	}
	let doc: Record<string, unknown> = {
		...(raw as Record<string, unknown>),
	};
	const from =
		typeof doc.version === "number" ? doc.version : SAVE_VERSION;
	if (from > SAVE_VERSION) {
		throw new Error(
			`save: envelope version ${from} is newer than supported ${SAVE_VERSION}`,
		);
	}
	for (let version = from; version < SAVE_VERSION; version++) {
		const upcaster = SAVE_MIGRATIONS[version + 1];
		if (upcaster) {
			doc = upcaster(doc);
		}
	}
	doc.version = SAVE_VERSION;
	return doc as unknown as Envelope;
};
