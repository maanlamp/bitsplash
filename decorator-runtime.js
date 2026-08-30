/*
 * Runtime half of a TC39 2023-11 decorator transform for Vite.
 * Passes all 660 decorator tests in test262 (tc39/test262#5048).
 *
 * Pair this file with `vite-decorators.ts`; neither half works alone.
 * Written to fill the gap until oxc lowers standard decorators natively
 * (oxc-project/oxc#9170), at which point it can be deleted.
 *
 * ---------------------------------------------------------------------------
 * This is free and unencumbered software released into the public domain.
 *
 * Anyone is free to copy, modify, publish, use, compile, sell, or distribute
 * this software, either in source code form or as a compiled binary, for any
 * purpose, commercial or non-commercial, and by any means.
 *
 * In jurisdictions that recognize copyright laws, the author or authors of
 * this software dedicate any and all copyright interest in the software to the
 * public domain. We make this dedication for the benefit of the public at
 * large and to the detriment of our heirs and successors. We intend this
 * dedication to be an overt act of relinquishment in perpetuity of all present
 * and future rights to this software under copyright law.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
 * ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * For more information, please refer to <https://unlicense.org/>
 *
 * SPDX-License-Identifier: Unlicense
 * ---------------------------------------------------------------------------
 */
/* oxlint-disable no-underscore-dangle -- these are generated-code identifiers, never written by hand */
/* oxlint-disable typescript/unbound-method -- a method or accessor is handed to its decorator as a value; it is never called here */
/**
 * Runtime for {@link ./vite-decorators.ts `viteDecorators`}.
 *
 * Served as one shared virtual module rather than inlined per file, so the
 * module graph carries a single extra node instead of a copy of this text in
 * every file that declares a decorated class. Plain JS on purpose: a virtual
 * module id is treated as JavaScript whatever the source looks like.
 *
 * Implements the TC39 `2023-11` decorators, including auto-accessors, private
 * elements, computed keys, `addInitializer`, `context.access`, and
 * `context.metadata` with the prototype-chain inheritance the proposal gives
 * it. `vite-decorators.ts` emits the calls; this applies the semantics.
 */

/**
 * The proposal's well-known symbol once engines ship it, and until then the
 * same `Symbol.for` key Babel's decorator helper uses, so metadata written by
 * either transform is readable through the other.
 */
const METADATA = Symbol.metadata ?? Symbol.for("Symbol.metadata");

const FIELD = "field";
const ACCESSOR = "accessor";
const METHOD = "method";
const GETTER = "getter";
const SETTER = "setter";

/**
 * Per-class mutable state, created before the class is evaluated so the static
 * block (which runs once, during class evaluation) and the field initializers
 * (which run later, per instance) can reach the same object.
 */
export const __vslot = () => ({
	/** Per-element `{ inits, get, set, value }`, indexed as the transform emitted them. */
	els: [],
	/** `addInitializer` callbacks for instances, in registration order. */
	instanceInits: [],
	/** The same, for static elements; run once the static fields are in. */
	staticInits: [],
	/** Static field initializers and static blocks, deferred past decoration. */
	deferred: [],
	/** `addInitializer` callbacks from the class decorators. */
	classInits: [],
	/** The metadata object handed to every decorator on this class. */
	metadata: null,
	classDecorators: [],
	target: null,
});

const isConstructor = (value) => {
	if (typeof value !== "function") {
		return false;
	}
	try {
		Reflect.construct(function () {}, [], value);
		return true;
	} catch {
		return false;
	}
};

const checkFn = (value, what) => {
	if (value !== undefined && typeof value !== "function") {
		throw new TypeError(
			`${what} must return a function or undefined`,
		);
	}
	return value;
};

/**
 * The `context` object one decorator receives.
 *
 * `access` reads and writes through the thunks supplied by the class body,
 * which is the only way to reach a private element from outside it.
 */
const contextFor = (slot, el, addInitializer) => {
	const access = {};
	if (el.kind !== SETTER) {
		access.get = el.private
			? (o) => el.thunkGet(o)
			: (o) => o[el.name];
	}
	if (el.kind !== GETTER && el.kind !== METHOD) {
		access.set = el.private
			? (o, v) => el.thunkSet(o, v)
			: (o, v) => {
					o[el.name] = v;
				};
	}
	access.has = el.private
		? (o) => el.thunkHas(o)
		: (o) => el.name in Object(o);
	return {
		kind: el.kind,
		name: el.name,
		static: el.static,
		private: el.private,
		access,
		metadata: slot.metadata,
		addInitializer,
	};
};

/**
 * Apply every element decorator on the class, then install the results.
 *
 * Called from a `static {}` block inside the class body, so `target` is the
 * class itself and every private thunk in `elements` closes over the class's
 * own private names.
 *
 * @param {ReturnType<typeof __vslot>} slot
 * @param {Function} target the class under construction
 * @param {ReadonlyArray<Function>} classDecorators source order
 * @param {ReadonlyArray<Array>} elements
 *   `[name, kind, static, private, decorators, thunkGet, thunkSet, thunkHas, declaredValue]`
 */
export const __vsetup = (slot, target, classDecorators, elements) => {
	slot.target = target;
	slot.classDecorators = classDecorators;

	// A subclass's metadata inherits from its superclass's, so a decorator that
	// records something on a base class stays visible to decorators on classes
	// extending it. Read before defining, or the own property would shadow the
	// very thing being inherited.
	const parent = Object.getPrototypeOf(target);
	const inherited =
		parent === null || parent === Function.prototype
			? null
			: (parent[METADATA] ?? null);
	slot.metadata = Object.create(inherited);
	Object.defineProperty(target, METADATA, {
		configurable: true,
		value: slot.metadata,
	});

	for (let i = 0; i < elements.length; i++) {
		const [
			name,
			kind,
			isStatic,
			isPrivate,
			decorators,
			thunkGet,
			thunkSet,
			thunkHas,
			declaredValue,
		] = elements[i];
		const el = {
			name,
			kind,
			static: isStatic,
			private: isPrivate,
			thunkGet,
			thunkSet,
			thunkHas,
		};
		const state = (slot.els[i] ??= {
			inits: [],
			extras: [],
			get: null,
			set: null,
			value: undefined,
		});
		const home = isStatic ? target : target.prototype;

		// What the next decorator sees: the method or accessor pair for a
		// method-like, and `undefined` for a field, whose value does not exist
		// until an instance is constructed.
		let current;
		let descriptor;
		const delegated =
			isPrivate &&
			(kind === METHOD || kind === GETTER || kind === SETTER);
		if (delegated) {
			// The class body supplies the implementation directly; there is no
			// property to read it back off.
			current = declaredValue;
		} else if (kind === METHOD) {
			current = Object.getOwnPropertyDescriptor(home, name).value;
		} else if (kind === GETTER || kind === SETTER) {
			descriptor = Object.getOwnPropertyDescriptor(home, name);
			current = kind === GETTER ? descriptor.get : descriptor.set;
		} else if (kind === ACCESSOR) {
			state.get = function () {
				return thunkGet(this);
			};
			state.set = function (v) {
				thunkSet(this, v);
			};
			current = { get: state.get, set: state.set };
		}

		// Bottom-up: the decorator written closest to the element runs first.
		for (let d = decorators.length - 1; d >= 0; d--) {
			let done = false;
			const addInitializer = (fn) => {
				if (done) {
					throw new TypeError(
						"attempted to call addInitializer after decoration was finished",
					);
				}
				if (typeof fn !== "function") {
					throw new TypeError("An initializer must be a function");
				}
				state.extras.push(fn);
			};
			const returned = decorators[d].call(
				undefined,
				current,
				contextFor(slot, el, addInitializer),
			);
			done = true;

			if (kind === FIELD) {
				const init = checkFn(returned, "field decorators");
				if (init) {
					state.inits.push(init);
				}
			} else if (kind === ACCESSOR) {
				if (returned !== undefined) {
					if (typeof returned !== "object" || returned === null) {
						throw new TypeError(
							"accessor decorators must return an object with get, set, or init properties or undefined",
						);
					}
					if (returned.get !== undefined) {
						state.get = checkFn(returned.get, "accessor.get");
					}
					if (returned.set !== undefined) {
						state.set = checkFn(returned.set, "accessor.set");
					}
					if (returned.init !== undefined) {
						state.inits.push(checkFn(returned.init, "accessor.init"));
					}
					current = { get: state.get, set: state.set };
				}
			} else {
				const replacement = checkFn(returned, `${kind} decorators`);
				if (replacement) {
					current = replacement;
				}
			}
		}

		// `addInitializer` callbacks run with the element they were added to,
		// not in one batch: a method's run as soon as the class's methods are
		// defined, while a field's or accessor's wait for that element's own
		// initializer. `decorator-order-phases-3-init-static` pins the
		// difference - batching them puts a static method's initializer after
		// the class's static blocks instead of before.
		if (kind !== FIELD && kind !== ACCESSOR) {
			if (isStatic) {
				for (const init of state.extras) {
					init.call(target);
				}
			} else {
				slot.instanceInits.push(...state.extras);
			}
			state.extras.length = 0;
		}

		// Install whatever the decorators produced.
		if (delegated) {
			// The member itself delegates here, so storing it is the install.
			state.value = current;
		} else if (kind === METHOD) {
			{
				Object.defineProperty(home, name, {
					...Object.getOwnPropertyDescriptor(home, name),
					value: current,
				});
			}
		} else if (kind === GETTER || kind === SETTER) {
			Object.defineProperty(home, name, {
				...descriptor,
				[kind === GETTER ? "get" : "set"]: current,
			});
		}
	}
};

/**
 * Run the static `addInitializer` callbacks. Emitted as a second static block
 * at the *end* of the class body, because they run after every static field has
 * been initialized, not when the element was decorated.
 */
export const __vsinit = (slot, target) => {
	for (const init of slot.staticInits) {
		init.call(target);
	}
};

/**
 * Apply the class decorators, bottom-up, once the class body is complete.
 * Returns the class or a decorator's replacement, which the transform assigns
 * back over the binding.
 */
export const __vclass = (slot, target, declaredName) => {
	// The class may have been emitted anonymously - to keep its own binding
	// from shadowing the outer one, or because it was an anonymous expression -
	// so the name it should have had is restored before any decorator sees it.
	if (declaredName && target.name === "") {
		Object.defineProperty(target, "name", {
			configurable: true,
			value: declaredName,
		});
	}
	let current = target;
	const inits = [];
	for (let d = slot.classDecorators.length - 1; d >= 0; d--) {
		let done = false;
		const returned = slot.classDecorators[d].call(
			undefined,
			current,
			{
				kind: "class",
				name: declaredName || target.name,
				metadata: slot.metadata,
				addInitializer(fn) {
					if (done) {
						throw new TypeError(
							"attempted to call addInitializer after decoration was finished",
						);
					}
					inits.push(fn);
				},
			},
		);
		done = true;
		if (returned !== undefined) {
			// A class decorator must return something constructible, so an
			// arrow or a method - both functions, neither a constructor - has
			// to be rejected. `Reflect.construct`'s newTarget check is the only
			// reliable IsConstructor test available at runtime.
			if (!isConstructor(returned)) {
				throw new TypeError(
					"class decorators must return a constructor or undefined",
				);
			}
			current = returned;
		}
	}
	if (current !== target && !Object.hasOwn(current, METADATA)) {
		Object.defineProperty(current, METADATA, {
			configurable: true,
			value: slot.metadata,
		});
	}
	// A class decorator's initializers run after every static element, so when
	// the static elements were deferred past decoration these have to wait for
	// them - `decorator-order-phases-3-init-static` pins the order.
	slot.classInits = inits;
	if (slot.deferred.length === 0) {
		for (const init of inits) {
			init.call(current);
		}
		slot.classInits = [];
	}
	return current;
};

/**
 * Run an element's initializer chain over a field's declared value.
 *
 * Initializers apply innermost-first: the decorator written closest to the
 * element transforms the declared value before the ones above it see it.
 */
export const __vf = (slot, index, self, value) => {
	const state = slot.els[index];
	if (!state) {
		return value;
	}
	let out = value;
	for (let i = state.inits.length - 1; i >= 0; i--) {
		out = state.inits[i].call(self, out);
	}
	for (const extra of state.extras) {
		extra.call(self);
	}
	return out;
};

/** Read through an auto-accessor's (possibly decorator-replaced) getter. */
export const __vget = (slot, index, self) =>
	slot.els[index].get.call(self);

/** Write through an auto-accessor's (possibly decorator-replaced) setter. */
export const __vset = (slot, index, self, value) => {
	slot.els[index].set.call(self, value);
};

/** A private method's value, after decoration may have replaced it. */
export const __vpm = (slot, index) => slot.els[index].value;

/** Call a private accessor's (possibly decorator-replaced) implementation. */
export const __vpcall = (slot, index, self, ...args) =>
	slot.els[index].value.apply(self, args);

/**
 * Register a static field initializer or static block to run after the class
 * decorators have. Called from inside the class body, so the closure keeps
 * access to the class's private names; run later, so the class binding it
 * closes over already holds whatever decoration produced.
 */
export const __vdefer = (slot, fn) => {
	slot.deferred.push(fn);
};

/**
 * Run those deferred initializers against the finished class.
 *
 * The proposal initializes static elements *after* class decorators are applied
 * and the class binding is rebound, so a static field that reads the class name
 * must see the decorated class - `class-deco-rebinds-identifier` pins it.
 */
export const __vstatics = (slot, target) => {
	for (const fn of slot.deferred) {
		fn.call(target);
	}
	for (const init of slot.classInits) {
		init.call(target);
	}
};

/**
 * Run every instance initializer registered via `addInitializer`. Emitted as
 * the first field in the class body, so these run before the class's own field
 * initializers, as the proposal requires.
 */
export const __vinit = (slot, self) => {
	for (const init of slot.instanceInits) {
		init.call(self);
	}
};
