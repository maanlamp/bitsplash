import { expect, test } from "bun:test";
import type { Seconds } from "../src/engine/duration";
import { defineMachine } from "../src/engine/fsm/machine";

type Ctx = {
	go: boolean;
	back: boolean;
	toC: boolean;
	toRun: boolean;
	panic: boolean;
};

const S = (n: number) => n as Seconds;
const calm: Ctx = {
	go: false,
	back: false,
	toC: false,
	toRun: false,
	panic: false,
};

test("flat transition fires and resets elapsed", () => {
	const m = defineMachine<Ctx>()({
		initial: "a",
		states: {
			a: { transitions: [{ to: "b", when: (c) => c.go }] },
			b: {},
		},
	});
	const r = m.step(
		{ current: "a", elapsed: S(2) },
		{ ...calm, go: true },
		S(1),
	);
	expect(r.next.current).toBe("b");
	expect(r.next.elapsed as number).toBe(0);
	expect(r.entered).toEqual(["b"]);
	expect(r.exited).toEqual(["a"]);
});

test("no transition only advances the clock", () => {
	const m = defineMachine<Ctx>()({
		initial: "a",
		states: {
			a: { transitions: [{ to: "b", when: (c) => c.go }] },
			b: {},
		},
	});
	const r = m.step({ current: "a", elapsed: S(2) }, calm, S(0.5));
	expect(r.next.current).toBe("a");
	expect(r.next.elapsed).toBeCloseTo(2.5);
	expect(r.entered).toEqual([]);
	expect(r.exited).toEqual([]);
});

test("explicit priority dominates depth", () => {
	const m = defineMachine<Ctx>()({
		initial: "leaf",
		root: [{ to: "panic", when: (c) => c.panic, priority: 100 }],
		states: {
			leaf: {
				children: ["run"],
				initial: "run",
			},
			run: {
				transitions: [{ to: "leaf", when: () => true }],
			},
			panic: {},
		},
	});
	const r = m.step(
		{ current: "run", elapsed: S(0) },
		{ ...calm, panic: true },
		S(0.1),
	);
	expect(r.next.current).toBe("panic");
});

test("deeper state wins ties at equal priority", () => {
	const m = defineMachine<Ctx>()({
		initial: "sup",
		states: {
			sup: {
				children: ["child"],
				initial: "child",
				transitions: [{ to: "other", when: () => true }],
			},
			child: {
				transitions: [{ to: "deep", when: () => true }],
			},
			deep: {},
			other: {},
		},
	});
	const r = m.step({ current: "child", elapsed: S(0) }, calm, S(0.1));
	expect(r.next.current).toBe("deep");
});

test("inherited transition fires from a descendant", () => {
	const m = defineMachine<Ctx>()({
		initial: "combat",
		states: {
			combat: {
				children: ["chase", "attack"],
				initial: "chase",
				transitions: [{ to: "patrol", when: (c) => c.back }],
			},
			chase: {},
			attack: {},
			patrol: {},
		},
	});
	const r = m.step(
		{ current: "chase", elapsed: S(1) },
		{ ...calm, back: true },
		S(0.1),
	);
	expect(r.next.current).toBe("patrol");
	expect(r.exited).toEqual(["chase", "combat"]);
	expect(r.entered).toEqual(["patrol"]);
});

test("transition to a super-state descends to its initial child", () => {
	const m = defineMachine<Ctx>()({
		initial: "patrol",
		states: {
			patrol: { transitions: [{ to: "combat", when: (c) => c.go }] },
			combat: { children: ["chase", "attack"], initial: "chase" },
			chase: {},
			attack: {},
		},
	});
	const r = m.step(
		{ current: "patrol", elapsed: S(0) },
		{ ...calm, go: true },
		S(0.1),
	);
	expect(r.next.current).toBe("chase");
	expect(r.entered).toEqual(["combat", "chase"]);
	expect(r.exited).toEqual(["patrol"]);
});

test("sibling swap does not re-enter the shared parent", () => {
	const m = defineMachine<Ctx>()({
		initial: "grounded",
		states: {
			grounded: {
				children: ["idle", "run"],
				initial: "idle",
			},
			idle: { transitions: [{ to: "run", when: (c) => c.toRun }] },
			run: {},
		},
	});
	const r = m.step(
		{ current: "idle", elapsed: S(3) },
		{ ...calm, toRun: true },
		S(0.1),
	);
	expect(r.next.current).toBe("run");
	expect(r.entered).toEqual(["run"]);
	expect(r.exited).toEqual(["idle"]);
});

test("restoring into a state emits no entered", () => {
	const m = defineMachine<Ctx>()({
		initial: "a",
		states: {
			a: { transitions: [{ to: "b", when: (c) => c.go }] },
			b: {},
		},
	});
	const restored = { current: "b" as const, elapsed: S(5) };
	const r = m.step(restored, calm, S(0.1));
	expect(r.next.current).toBe("b");
	expect(r.entered).toEqual([]);
	expect(r.exited).toEqual([]);
});

test("start descends the initial super-state to a leaf", () => {
	const m = defineMachine<Ctx>()({
		initial: "combat",
		states: {
			combat: { children: ["chase"], initial: "chase" },
			chase: {},
		},
	});
	expect(m.start()).toEqual({ current: "chase", elapsed: S(0) });
	expect(m.initialLeaf).toBe("chase");
});

test("validation rejects an unknown transition target", () => {
	expect(() =>
		defineMachine<Ctx>()({
			initial: "a",
			states: {
				a: {
					transitions: [{ to: "ghost" as "a", when: () => true }],
				},
			},
		}),
	).toThrow(/unknown state "ghost"/);
});

test("validation rejects a super-state without an initial child", () => {
	expect(() =>
		defineMachine<Ctx>()({
			initial: "sup",
			states: {
				sup: { children: ["kid"] } as { children: "kid"[] },
				kid: {},
			} as never,
		}),
	).toThrow(/must declare an "initial" child/);
});
