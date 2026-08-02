/**
 * The writable form of a readonly value type.
 *
 * Frame-loop code hands out readonly shapes but has to *fill* them somewhere,
 * and that somewhere is a buffer it owns and refills rather than a fresh object
 * per call. This names that buffer's type from the public one, so the two
 * cannot drift: add a field to the readonly type and every pool writing it is
 * updated with it.
 *
 * @example
 * type MutableGlyphQuad = Mutable<GlyphQuad>;
 * const scratch: MutableGlyphQuad = { x: 0, y: 0, w: 0, h: 0 };
 */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };
