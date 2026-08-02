import { Camera2D, type Bounds } from "../engine/camera/camera-2d";
import { Camera2DComponent } from "../engine/camera/camera-2d-component";
import { Camera2DFollowComponent } from "../engine/camera/camera-2d-follow-component";
import { CameraShakeComponent } from "../engine/camera/camera-shake-component";
import { TransformComponent } from "../engine/transform-component";
import type { EntityId } from "../engine/ecs";
import { TILE_SIZE } from "../engine/tilemap/tile";
import Vector2 from "../engine/vector2";
import type { World } from "../engine/world";

const followComponent = (
	target: EntityId,
	bounds: Bounds | null,
): Camera2DFollowComponent =>
	new Camera2DFollowComponent({
		targets: [target],
		zoom: 3,
		deadzone: { x: 2 * TILE_SIZE, y: 1.5 * TILE_SIZE },
		lookahead: { seconds: 0.25, max: 4 * TILE_SIZE },
		bounds,
	});

export const spawnCamera2D = (
	world: World,
	options: Readonly<{ target: EntityId; bounds?: Bounds | null }>,
): EntityId => {
	const bounds = options.bounds ?? null;
	const existing = world.ecs.first(Camera2DComponent);
	if (existing) {
		const [id] = existing;
		if (!world.ecs.getComponent(id, Camera2DFollowComponent)) {
			world.ecs.addComponent(
				id,
				followComponent(options.target, bounds),
			);
			if (!world.ecs.getComponent(id, CameraShakeComponent)) {
				world.ecs.addComponent(id, new CameraShakeComponent());
			}
		}
		return id;
	}

	const transform = world.ecs.getComponent(
		options.target,
		TransformComponent,
	);
	const start = transform
		? transform.position.clone()
		: Vector2.zero();

	return world.ecs.createEntity([
		new Camera2DComponent(new Camera2D(start, 3), true, 0),
		new CameraShakeComponent(),
		followComponent(options.target, bounds),
	]);
};
