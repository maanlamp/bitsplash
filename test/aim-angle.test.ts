import { expect, test } from "bun:test";
import { AimAngle } from "../src/engine/input/aim/aim-angle";
import type { AimSettingsValues } from "../src/engine/input/aim/aim-settings";
import { normalizeAngle } from "../src/engine/input/aim/aim-shaping";

const settings = (
	overrides: Partial<AimSettingsValues> = {},
): AimSettingsValues => ({
	sensitivity: 2,
	deadzone: 0.1,
	responseCurve: 1,
	...overrides,
});

test("setFromPointer resolves owner->cursor angle absolutely", () => {
	const aim = new AimAngle();
	expect(aim.setFromPointer(0, 0, 1, 0)).toBeCloseTo(0, 6);
	expect(aim.setFromPointer(0, 0, 0, 1)).toBeCloseTo(Math.PI / 2, 6);
	expect(aim.sample()).toBeCloseTo(Math.PI / 2, 6);
});

test("stick source integrates angular velocity into the angle", () => {
	const aim = new AimAngle(0, 1);
	aim.integrate(1, 0.5, settings());
	expect(aim.sample()).toBeCloseTo(1, 6);
	aim.integrate(1, 0.5, settings());
	expect(aim.sample()).toBeCloseTo(2, 6);
});

test("incoming source seeds from the current angle (no teleport)", () => {
	const aim = new AimAngle(0, 1);
	aim.integrate(1, 0.5, settings());
	const beforeSwitch = aim.sample();
	expect(beforeSwitch).toBeCloseTo(1, 6);

	aim.seed(aim.sample());
	expect(aim.sample()).toBeCloseTo(beforeSwitch, 6);

	aim.integrate(1, 0.5, settings());
	expect(aim.sample()).toBeCloseTo(beforeSwitch + 1, 6);
	expect(Math.abs(aim.sample())).toBeGreaterThan(0.5);
});

test("deadzone suppresses sub-threshold stick samples", () => {
	const aim = new AimAngle();
	aim.integrate(0.05, 1, settings({ deadzone: 0.1 }));
	expect(aim.sample()).toBe(0);
});

test("dt is clamped so a frame hitch cannot fling the angle", () => {
	const aim = new AimAngle();
	aim.integrate(1, 10, settings({ deadzone: 0, sensitivity: 2 }));
	expect(aim.sample()).toBeCloseTo(2 * (1 / 15), 6);
});

test("response curve shapes the sample before integration", () => {
	const aim = new AimAngle(0, 1);
	aim.integrate(0.5, 1, settings({ deadzone: 0, responseCurve: 2 }));
	expect(aim.sample()).toBeCloseTo(0.25 * 2, 6);
});

test("integrated angle stays normalized to (-pi, pi]", () => {
	const aim = new AimAngle();
	for (let i = 0; i < 20; i += 1) {
		aim.integrate(1, 1, settings({ deadzone: 0, sensitivity: 5 }));
		expect(aim.sample()).toBeLessThanOrEqual(Math.PI + 1e-9);
		expect(aim.sample()).toBeGreaterThan(-Math.PI - 1e-9);
	}
});

test("normalizeAngle wraps into a single turn", () => {
	expect(normalizeAngle(0)).toBeCloseTo(0, 6);
	expect(normalizeAngle(Math.PI * 2)).toBeCloseTo(0, 6);
	expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 6);
	expect(normalizeAngle(-Math.PI * 3)).toBeCloseTo(Math.PI, 6);
});
