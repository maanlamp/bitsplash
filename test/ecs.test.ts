import { expect, test } from "bun:test";
import { ECS, type EntityId } from "../src/engine/ecs";

class Foo {}
class Bar {}
class Base {}
class Derived extends Base {}

class ParentLink {
	constructor(public child: EntityId | null = null) {}
}

test("destroy defers until flushDestroyed", () => {
	const ecs = new ECS();
	const id = ecs.createEntity([new Foo()]);
	ecs.destroy(id);
	expect(ecs.getComponent(id, Foo)).toBeDefined();
	expect(ecs.entities()).toContain(id);
	ecs.flushDestroyed();
	expect(ecs.getComponent(id, Foo)).toBeUndefined();
	expect(ecs.entities()).not.toContain(id);
});

test("flushDestroyed runs each hook once and notifies once", () => {
	const ecs = new ECS();
	let fooHooks = 0;
	let barHooks = 0;
	ecs.onDestroy(Foo, () => {
		fooHooks++;
	});
	ecs.onDestroy(Bar, () => {
		barHooks++;
	});
	const id = ecs.createEntity([new Foo(), new Bar()]);
	let notifications = 0;
	ecs.subscribe(() => {
		notifications++;
	});
	ecs.destroy(id);
	ecs.flushDestroyed();
	expect(fooHooks).toBe(1);
	expect(barHooks).toBe(1);
	expect(notifications).toBe(1);
});

test("flushDestroyed with nothing pending does not notify", () => {
	const ecs = new ECS();
	let notifications = 0;
	ecs.subscribe(() => {
		notifications++;
	});
	ecs.flushDestroyed();
	expect(notifications).toBe(0);
});

test("cascade: a hook that destroys a child removes it in the same flush", () => {
	const ecs = new ECS();
	const child = ecs.createEntity([new Foo()]);
	const parent = ecs.createEntity([new ParentLink(child)]);
	ecs.onDestroy(ParentLink, (link: ParentLink) => {
		if (link.child) {
			ecs.destroy(link.child);
		}
	});
	ecs.destroy(parent);
	ecs.flushDestroyed();
	expect(ecs.entities()).not.toContain(parent);
	expect(ecs.entities()).not.toContain(child);
});

test("destroy is idempotent across doubles, re-destroy, and hook re-destroy", () => {
	const ecs = new ECS();
	let hooks = 0;
	ecs.onDestroy(Foo, (_c, id) => {
		hooks++;
		ecs.destroy(id);
	});
	const id = ecs.createEntity([new Foo()]);
	ecs.destroy(id);
	ecs.destroy(id);
	ecs.flushDestroyed();
	expect(hooks).toBe(1);
	expect(ecs.entities()).not.toContain(id);
	ecs.destroy(id);
	ecs.flushDestroyed();
	expect(hooks).toBe(1);
});

test("reset runs hooks for every live entity and clears pending", () => {
	const ecs = new ECS();
	let hooks = 0;
	ecs.onDestroy(Foo, () => {
		hooks++;
	});
	const a = ecs.createEntity([new Foo()]);
	ecs.createEntity([new Foo()]);
	ecs.destroy(a);
	ecs.reset();
	expect(hooks).toBe(2);
	expect(ecs.entities()).toHaveLength(0);
	const c = ecs.createEntity([new Foo()]);
	ecs.flushDestroyed();
	expect(ecs.entities()).toContain(c);
	expect(hooks).toBe(2);
});

test("dispatch resolves to the instance's concrete constructor", () => {
	const ecs = new ECS();
	let baseHooks = 0;
	let derivedHooks = 0;
	ecs.onDestroy(Base, () => {
		baseHooks++;
	});
	ecs.onDestroy(Derived, () => {
		derivedHooks++;
	});
	const id = ecs.createEntity([new Derived()]);
	ecs.destroy(id);
	ecs.flushDestroyed();
	expect(derivedHooks).toBe(1);
	expect(baseHooks).toBe(0);
});
