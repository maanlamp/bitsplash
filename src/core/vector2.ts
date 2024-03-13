export const deg2rad = (deg: number) => (deg * Math.PI) / 180;

export const lenDir = (len: number, dir: number) =>
	[Math.cos(deg2rad(dir)) * len, Math.sin(deg2rad(dir)) * len] as const;
