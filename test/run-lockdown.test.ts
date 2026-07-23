import { describe, expect, test } from "bun:test";
import {
	isSceneLockedOut,
	runStopsOnViewClose,
	runStopsOnWindowClose,
} from "../src/editor/run-lockdown";

describe("one-run-at-a-time lockdown", () => {
	test("no run active: nothing is locked out", () => {
		expect(isSceneLockedOut(null, "scene:a")).toBe(false);
		expect(isSceneLockedOut(null, "scene:b")).toBe(false);
	});

	test("run active: the anchor view is never locked out", () => {
		expect(isSceneLockedOut("scene:a", "scene:a")).toBe(false);
	});

	test("run active: every other scene view is locked out", () => {
		expect(isSceneLockedOut("scene:a", "scene:b")).toBe(true);
		expect(isSceneLockedOut("scene:a", "scene:c")).toBe(true);
	});
});

describe("anchor-close stops the run", () => {
	test("no run active: closing any view stops nothing", () => {
		expect(runStopsOnViewClose(null, "scene:a")).toBe(false);
	});

	test("closing the anchor view stops the run", () => {
		expect(runStopsOnViewClose("scene:a", "scene:a")).toBe(true);
	});

	test("closing a non-anchor view leaves the run alone", () => {
		expect(runStopsOnViewClose("scene:a", "scene:b")).toBe(false);
	});

	test("no run active: closing any window stops nothing", () => {
		expect(runStopsOnWindowClose(null, "hub")).toBe(false);
	});

	test("closing the anchor's window stops the run", () => {
		expect(runStopsOnWindowClose("hub", "hub")).toBe(true);
		expect(runStopsOnWindowClose("win-2", "win-2")).toBe(true);
	});

	test("closing a window without the anchor leaves the run alone", () => {
		expect(runStopsOnWindowClose("hub", "win-2")).toBe(false);
	});
});
