import type { Seconds } from "../../engine/duration";
import { profiler } from "../../engine/profiling/profiler";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { DamageEvent } from "../events";
import {
	DPS_SAMPLE_CAPACITY,
	DpsMeterComponent,
} from "./dps-meter-component";

/** Rolling window the rate is measured over: damage inside it, per second. */
const WINDOW = 1 as Seconds;

/** Silence that ends a combo and clears the tally. */
const IDLE_RESET = 2 as Seconds;

/**
 * Tallies damage landing on entities carrying a {@link DpsMeterComponent} and
 * keeps their rate over a rolling {@link WINDOW}.
 *
 * The rate is recomputed only when a hit lands and then held, rather than
 * decaying as the window slides off the last hit: a combo's peak stays readable
 * while `DpsMeterHudSystem` fades the number out over the tail of the idle
 * countdown. After {@link IDLE_RESET} of silence the tally clears, so the next
 * combo reads on its own.
 */
@profiler("DPS meter", "Combat")
export class DpsMeterSystem implements UpdateSystem {
	update({ dt, ecs, events }: UpdateContext): void {
		const dtSeconds = (dt / 1000) as Seconds;
		for (const [, meter] of ecs.query(DpsMeterComponent)) {
			meter.clock += dtSeconds;
			meter.idle.tick(dtSeconds);
			if (meter.count > 0 && meter.idle.done()) {
				this.clear(meter);
			}
		}
		for (const event of events.read(DamageEvent)) {
			if (event.amount <= 0) {
				continue;
			}
			const meter = ecs.getComponent(event.target, DpsMeterComponent);
			if (meter) {
				this.record(meter, event.amount);
			}
		}
	}

	private record(meter: DpsMeterComponent, amount: number): void {
		meter.at[meter.head] = meter.clock;
		meter.amount[meter.head] = amount;
		meter.head = (meter.head + 1) % DPS_SAMPLE_CAPACITY;
		if (meter.count < DPS_SAMPLE_CAPACITY) {
			meter.count++;
		}
		meter.idle.restart(IDLE_RESET);
		this.recompute(meter);
	}

	/**
	 * Walk the samples newest-first, stopping at the first one that has aged out
	 * of the window — they are in time order, so everything past it is stale and
	 * `count` can simply shrink to what was kept.
	 */
	private recompute(meter: DpsMeterComponent): void {
		let total = 0;
		let kept = 0;
		while (kept < meter.count) {
			const index =
				(meter.head - 1 - kept + DPS_SAMPLE_CAPACITY) %
				DPS_SAMPLE_CAPACITY;
			if (meter.clock - meter.at[index]! > WINDOW) {
				break;
			}
			total += meter.amount[index]!;
			kept++;
		}
		meter.count = kept;
		meter.rate = total / WINDOW;
		meter.text = `${meter.rate.toFixed(1)} DPS`;
	}

	private clear(meter: DpsMeterComponent): void {
		meter.count = 0;
		meter.rate = 0;
		meter.text = "";
	}
}
