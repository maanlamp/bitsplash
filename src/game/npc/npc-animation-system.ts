import type { Seconds } from "../../engine/duration";
import { FacingComponent } from "../../engine/locomotion/facing-component";
import { LocomotionComponent } from "../../engine/locomotion/locomotion-component";
import { MovementIntentComponent } from "../../engine/locomotion/movement-intent-component";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import { profiler } from "../../engine/profiling/profiler";
import { SpriteComponent } from "../../engine/sprite/sprite-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { stepMachine } from "../../engine/fsm/step-machine";
import { playerAnimMachine } from "../player/player-anim-def";
import { NpcAnimationComponent } from "./npc-animation-component";

@profiler("NPC animation", "Animation")
export class NpcAnimationSystem implements UpdateSystem {
	update({ ecs, dt }: UpdateContext): void {
		for (const [, npc, sprite, facing, intent, loco, rb] of ecs.query(
			NpcAnimationComponent,
			SpriteComponent,
			FacingComponent,
			MovementIntentComponent,
			LocomotionComponent,
			PhysicsBodyComponent,
		)) {
			if (!rb.body) {
				continue;
			}
			const dir = Math.sign(intent.moveX);
			const vy = rb.linearVelocity.y;

			sprite.current = npc.anim.current;
			sprite.flipX = facing.dir < 0;

			stepMachine(
				playerAnimMachine,
				npc.anim,
				{
					grounded: loco.grounded,
					onWall: false,
					wallJumping: false,
					landing: false,
					dashing: false,
					dir,
					facing: facing.dir,
					vy,
				},
				(dt / 1000) as Seconds,
			);
		}
	}
}
