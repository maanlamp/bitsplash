import { unzipSync } from "fflate";
import { useEffect, useState } from "react";
import { readBinaryFile } from "../project-io";

const BAKE_ENTRY = "bakes/0.png";

/**
 * Extract the baked frame-0 PNG (`bakes/0.png`) from a `.bsprite` archive's raw
 * bytes — the frame the editor uses as the asset thumbnail. Returns `undefined`
 * when the entry is absent or the archive is unreadable.
 */
export const extractBakeFrame0 = (
	bytes: Uint8Array,
): Uint8Array | undefined => {
	try {
		const entries = unzipSync(bytes, {
			filter: (file) => file.name === BAKE_ENTRY,
		});
		return entries[BAKE_ENTRY];
	} catch {
		return undefined;
	}
};

/**
 * Thumbnail for a `.bsprite` asset: reads the archive bytes through the desktop
 * bridge, extracts `bakes/0.png`, and renders it as an object-URL image. A
 * `.bsprite` is a zip, so it cannot be shown by pointing an `<img>` at the raw
 * file the way a `.png` can. Renders nothing until the bake resolves.
 */
export const BspriteThumbnail = ({
	path,
	alt,
	className,
}: Readonly<{
	path: string;
	alt: string;
	className?: string;
}>) => {
	const [src, setSrc] = useState<string | null>(null);

	useEffect(() => {
		let objectUrl: string | null = null;
		let cancelled = false;
		void readBinaryFile(path)
			.then((bytes) => {
				const png = extractBakeFrame0(new Uint8Array(bytes));
				if (png && !cancelled) {
					objectUrl = URL.createObjectURL(
						new Blob([png as BlobPart], { type: "image/png" }),
					);
					setSrc(objectUrl);
				}
			})
			.catch(() => {});
		return () => {
			cancelled = true;
			if (objectUrl) {
				URL.revokeObjectURL(objectUrl);
			}
		};
	}, [path]);

	return src ? (
		<img className={className} src={src} alt={alt} loading="lazy" />
	) : null;
};
