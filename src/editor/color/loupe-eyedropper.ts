import { type OklchColor, rgbToOklch } from "./oklch";

type Rgb = { r: number; g: number; b: number };

type DesktopCapture = { capturePage?: () => Promise<string> };

const desktop = (): DesktopCapture | undefined =>
	(globalThis as { bitsplashDesktop?: DesktopCapture })
		.bitsplashDesktop;

// Whether an in-app screenshot is available to drive the custom loupe.
export const captureSupported = (): boolean =>
	typeof desktop()?.capturePage === "function";

const captureWindow = async (): Promise<string | null> => {
	const bridge = desktop();
	if (!bridge?.capturePage) {
		return null;
	}
	try {
		return await bridge.capturePage();
	} catch {
		return null;
	}
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
	new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("capture load failed"));
		img.src = src;
	});

const COUNT = 13; // pixels shown across the loupe (odd, so one is centred)
const PIXEL = 12; // css px per source pixel
const HALF = (COUNT - 1) / 2;
const RADIUS = (COUNT * PIXEL) / 2;

// Shows a frozen screenshot with a circular magnifier under the cursor and
// resolves to the clicked pixel (or null if cancelled with Esc / right-click).
const runLoupe = (img: HTMLImageElement): Promise<Rgb | null> => {
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const scaleX = img.width / vw;
	const scaleY = img.height / vh;
	const dpr = window.devicePixelRatio || 1;

	// 1:1 buffer for exact pixel reads.
	const sample = document.createElement("canvas");
	sample.width = img.width;
	sample.height = img.height;
	const sctx = sample.getContext("2d", { willReadFrequently: true })!;
	sctx.drawImage(img, 0, 0);
	const data = sctx.getImageData(0, 0, img.width, img.height).data;

	const overlay = document.createElement("canvas");
	overlay.width = Math.round(vw * dpr);
	overlay.height = Math.round(vh * dpr);
	overlay.style.position = "fixed";
	overlay.style.inset = "0";
	overlay.style.width = "100%";
	overlay.style.height = "100%";
	overlay.style.zIndex = "2147483647";
	overlay.style.cursor = "none";
	document.body.appendChild(overlay);

	const ctx = overlay.getContext("2d")!;
	ctx.scale(dpr, dpr);

	const pixelAt = (px: number, py: number): Rgb => {
		const x = Math.max(0, Math.min(img.width - 1, px));
		const y = Math.max(0, Math.min(img.height - 1, py));
		const i = (y * img.width + x) * 4;
		return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]! };
	};

	const draw = (cx: number, cy: number): void => {
		ctx.clearRect(0, 0, vw, vh);
		ctx.imageSmoothingEnabled = true;
		ctx.drawImage(img, 0, 0, vw, vh);

		const bx = Math.round(cx * scaleX);
		const by = Math.round(cy * scaleY);
		const dx = cx - (HALF + 0.5) * PIXEL;
		const dy = cy - (HALF + 0.5) * PIXEL;
		const span = COUNT * PIXEL;

		ctx.save();
		ctx.beginPath();
		ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2);
		ctx.clip();

		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(
			sample,
			bx - HALF,
			by - HALF,
			COUNT,
			COUNT,
			dx,
			dy,
			span,
			span,
		);

		ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
		ctx.lineWidth = 1;
		ctx.beginPath();
		for (let i = 0; i <= COUNT; i++) {
			const gx = Math.round(dx + i * PIXEL) + 0.5;
			ctx.moveTo(gx, dy);
			ctx.lineTo(gx, dy + span);
			const gy = Math.round(dy + i * PIXEL) + 0.5;
			ctx.moveTo(dx, gy);
			ctx.lineTo(dx + span, gy);
		}
		ctx.stroke();

		ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
		ctx.lineWidth = 1;
		ctx.strokeRect(
			cx - PIXEL / 2 - 1,
			cy - PIXEL / 2 - 1,
			PIXEL + 2,
			PIXEL + 2,
		);
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = 2;
		ctx.strokeRect(cx - PIXEL / 2, cy - PIXEL / 2, PIXEL, PIXEL);

		ctx.restore();

		ctx.beginPath();
		ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2);
		ctx.lineWidth = 3;
		ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(cx, cy, RADIUS - 1.5, 0, Math.PI * 2);
		ctx.lineWidth = 1.5;
		ctx.strokeStyle = "#fff";
		ctx.stroke();
	};

	return new Promise<Rgb | null>((resolve) => {
		let cx = vw / 2;
		let cy = vh / 2;

		const cleanup = (result: Rgb | null): void => {
			window.removeEventListener("pointermove", onMove, true);
			window.removeEventListener("pointerdown", onDown, true);
			window.removeEventListener("keydown", onKey, true);
			window.removeEventListener("contextmenu", onContext, true);
			overlay.remove();
			resolve(result);
		};
		const onMove = (e: PointerEvent): void => {
			cx = e.clientX;
			cy = e.clientY;
			draw(cx, cy);
		};
		const onDown = (e: PointerEvent): void => {
			e.preventDefault();
			e.stopPropagation();
			if (e.button !== 0) {
				cleanup(null);
				return;
			}
			cleanup(
				pixelAt(
					Math.round(e.clientX * scaleX),
					Math.round(e.clientY * scaleY),
				),
			);
		};
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				cleanup(null);
			}
		};
		const onContext = (e: Event): void => {
			e.preventDefault();
		};

		window.addEventListener("pointermove", onMove, true);
		window.addEventListener("pointerdown", onDown, true);
		window.addEventListener("keydown", onKey, true);
		window.addEventListener("contextmenu", onContext, true);
		draw(cx, cy);
	});
};

// Picks a colour from anywhere in the app window using a custom magnifier.
export const pickWithLoupe = async (): Promise<OklchColor | null> => {
	const dataUrl = await captureWindow();
	if (!dataUrl) {
		return null;
	}
	const img = await loadImage(dataUrl);
	const rgb = await runLoupe(img);
	if (!rgb) {
		return null;
	}
	const { l, c, h } = rgbToOklch(rgb.r, rgb.g, rgb.b);
	return { l, c, h, alpha: 1 };
};
