export type TPhysicsObject = {
	x: number;
	y: number;
	w: number;
	h: number;
	vx: number;
	vy: number;
	ax: number;
	ay: number;
	mass: number;
	immovable?: boolean;
	restitution: number;
	drag: number;
	getBoundingBox(): PhysicsBoundingBox;
};

export type PhysicsBoundingBox = Readonly<{
	top: number;
	right: number;
	bottom: number;
	left: number;
}>;

export const PhysicsObject = (
	source?: Partial<TPhysicsObject>
): TPhysicsObject => {
	const self: TPhysicsObject = {
		x: source?.x ?? 0,
		y: source?.y ?? 0,
		w: source?.w ?? 0,
		h: source?.h ?? 0,
		vx: source?.vx ?? 0,
		vy: source?.vy ?? 0,
		ax: source?.ax ?? 0,
		ay: source?.ay ?? 0,
		mass: source?.mass ?? 1,
		immovable: source?.immovable,
		restitution: source?.restitution ?? 0.33,
		drag: 0.1,
		getBoundingBox: () => ({
			top: self.y,
			right: self.x + self.w,
			bottom: self.y + self.h,
			left: self.x,
		}),
	};
	return self;
};

const vxmax = 0.2;
const vymax = 0.33;
export const delegatePhysics = (
	self: TPhysicsObject,
	others: ReadonlyArray<TPhysicsObject>,
	delta: number,
	world: TWorld
) => {
	if (self.immovable) return;

	self.vx += self.ax * delta * (1 - world.drag);
	self.vy += (self.ay * delta + world.gravity) * (1 - world.drag);
	self.x += self.vx * delta;
	self.y += self.vy * delta;

	self.getBoundingBox = () => ({
		top: self.y,
		right: self.x + self.w,
		bottom: self.y + self.h,
		left: self.x,
	});

	const collisions = others.filter(other => {
		const selfBox = self.getBoundingBox();
		const otherBox = other.getBoundingBox();
		if (selfBox.right < otherBox.left || selfBox.left > otherBox.right)
			return false;
		if (selfBox.bottom < otherBox.top || selfBox.top > otherBox.bottom)
			return false;
		return true;
	});

	for (const other of collisions) {
		// TODO: X axis
		const bounce = Math.max(self.restitution, other.restitution);
		// TODO: What if coming from below?
		self.vy *= -bounce;

		const drag = 1 - Math.max(self.drag, other.drag);
		self.vx *= drag;
		self.vy *= drag;

		const selfBox = self.getBoundingBox();
		const otherBox = other.getBoundingBox();
		const penetrationY =
			selfBox.bottom > otherBox.top
				? selfBox.bottom - otherBox.top
				: otherBox.bottom - selfBox.top;
		self.y -= penetrationY;
	}

	self.vy = self.vy < -vymax ? -vymax : self.vy > vymax ? vymax : self.vy;
	self.vx = self.vx < -vxmax ? -vxmax : self.vx > vxmax ? vxmax : self.vx;
};

export type TWorld = Readonly<{
	gravity: number;
	drag: number;
}>;
