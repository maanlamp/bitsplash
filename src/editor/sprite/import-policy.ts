/**
 * The shared **import-refusal policy** for the sprite editor's read-only source
 * importers (`.pdn`, and later `.ora`). The rule (Phase 4): a source file that
 * uses anything `.bsprite` cannot represent — an unmappable blend mode, a
 * non-RGBA surface, an unsupported layer type or effect — is **refused** with a
 * message that names every offending layer and feature. There is no silent
 * flattening and no partial import: either the whole file maps cleanly or none
 * of it is imported.
 *
 * An importer collects {@link UnsupportedFeature}s as it walks the source, then
 * calls {@link refuseIfUnsupported} once so a single error names them all.
 */

/** One thing in a source file that `.bsprite` cannot represent. */
export type UnsupportedFeature = Readonly<{
	/**
	 * Where the problem is — a layer name (quoted by the caller) or a file-level
	 * feature — so the user can find and remove it.
	 */
	where: string;
	/** What is unrepresentable, e.g. `the "Xor" blend mode` or `a 24-bit surface`. */
	what: string;
}>;

/**
 * Thrown when a source file uses features `.bsprite` cannot represent. Carries
 * the full list so a UI can render each offending layer/feature individually;
 * {@link Error.message} is a single human-readable sentence naming them all.
 */
export class UnsupportedImportError extends Error {
	constructor(
		readonly format: string,
		readonly features: readonly UnsupportedFeature[],
	) {
		const list = features
			.map((f) => `${f.where} uses ${f.what}`)
			.join("; ");
		super(
			`Cannot import this ${format} file: ${list}. .bsprite has no equivalent, so nothing was imported — remove or change the offending layer(s) and export again.`,
		);
		this.name = "UnsupportedImportError";
	}
}

/**
 * Refuse the import when any unrepresentable features were collected, raising an
 * {@link UnsupportedImportError} that names them all. A no-op when the list is
 * empty, so importers can call it unconditionally before producing a document.
 *
 * @throws {UnsupportedImportError} when `features` is non-empty.
 */
export const refuseIfUnsupported = (
	format: string,
	features: readonly UnsupportedFeature[],
): void => {
	if (features.length > 0) {
		throw new UnsupportedImportError(format, features);
	}
};
