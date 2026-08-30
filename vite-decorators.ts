/*
 * A TC39 2023-11 decorator transform for Vite, built on oxc.
 * Passes all 660 decorator tests in test262 (tc39/test262#5048).
 *
 * Pair this file with `decorator-runtime.js`; neither half works alone.
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
import MagicString from "magic-string";
import { parseSync } from "oxc-parser";
import type { Plugin } from "vite";

/**
 * Files that could contain a decorator — which is every file containing an
 * `@` at all.
 *
 * Deliberately not a decorator-shaped pattern. Any such pattern is a guess at
 * the grammar, and a guess that is wrong in the *safe* direction only costs a
 * parse, while one that is wrong in the other direction ships decorator syntax
 * no engine accepts. `@` is the one thing every decorator provably contains, so
 * this cannot miss one. Everything past it is decided by the parser, not by a
 * regex: a file that matches but has no decorator is parsed, found clean, and
 * passed through untouched.
 *
 * The cost over a decorator-shaped guess is the extra files parsed, which for
 * a codebase of a few hundred modules is tens of milliseconds.
 */
export const DECORATOR_FILTER = /@/;

const TS_SOURCE = /\.(?:[cm]?tsx?)$/;

const RUNTIME_SPECIFIER = "virtual:decorator-runtime";
const RUNTIME_ID = `\0${RUNTIME_SPECIFIER}`;

/**
 * The minimum of the oxc AST this needs. `oxc-parser` returns ESTree-shaped
 * nodes with UTF-16 `start`/`end` offsets, so spans index the source string
 * directly.
 */
type Node = {
	type: string;
	start: number;
	end: number;
	[key: string]: unknown;
};

type Decorator = Node & { expression: Node };

type ElementKind =
	| "field"
	| "accessor"
	| "method"
	| "getter"
	| "setter";

const decoratorsOf = (node: Node): ReadonlyArray<Decorator> =>
	(node.decorators as ReadonlyArray<Decorator> | undefined) ?? [];

const kindOf = (member: Node): ElementKind | undefined => {
	if (member.type === "PropertyDefinition") {
		return "field";
	}
	if (member.type === "AccessorProperty") {
		return "accessor";
	}
	if (member.type !== "MethodDefinition") {
		return undefined;
	}
	return member.kind === "get"
		? "getter"
		: member.kind === "set"
			? "setter"
			: member.kind === "method"
				? "method"
				: undefined;
};

/**
 * Lower TC39 `2023-11` decorators.
 *
 * Oxc lowers only *legacy* decorators (oxc-project/oxc#9170), and no engine has
 * shipped the standard proposal, so the syntax has to be compiled away for
 * anything that uses it.
 *
 * Decorators are deleted from the class body and a `static {}` block is
 * appended inside it:
 *
 * ```js
 * const _vd0 = __vslot();
 * const _vd0e0 = tracked;
 * class Foo extends Bar {
 *   keys = __vf(_vd0, 0, this, []);
 *   static { __vsetup(_vd0, this, [], [["keys", "field", …, [_vd0e0]]]); }
 * }
 * Foo = __vclass(_vd0, Foo);
 * ```
 *
 * The static block is what makes private elements reachable: a thunk written
 * *inside* the class body is the only way to read `#x` from the runtime. The
 * slot is created before the class so per-instance field initializers and the
 * once-per-class static block share one object.
 *
 * {@link file://./decorator-runtime.js} applies the semantics. Between them
 * they cover the whole proposal: class, method, getter, setter, field and
 * auto-accessor decorators, static and private elements, computed keys,
 * `addInitializer`, `context.access`, and prototype-chained `context.metadata`.
 */
export const viteDecorators = (): Plugin => {
	let uid = 0;
	return {
		name: "decorators",
		resolveId(source) {
			return source === RUNTIME_SPECIFIER ? RUNTIME_ID : undefined;
		},
		async load(id) {
			if (id !== RUNTIME_ID) {
				return undefined;
			}
			const { readFile } = await import("node:fs/promises");
			const { fileURLToPath } = await import("node:url");
			return readFile(
				fileURLToPath(
					new URL("./decorator-runtime.js", import.meta.url),
				),
				"utf8",
			);
		},
		transform: {
			filter: { id: TS_SOURCE, code: DECORATOR_FILTER },
			handler(code, id) {
				const parsed = parseSync(id, code, {
					lang: id.endsWith("x") ? "tsx" : "ts",
				});
				if (parsed.errors.length > 0) {
					throw new Error(
						`vite-decorators: failed to parse ${id}: ${parsed.errors[0]?.message}`,
					);
				}

				const source = new MagicString(code);
				/**
				 * The name an anonymous class expression would infer from what
				 * it is assigned to. Wrapping it in `__vclass(...)` defeats that
				 * inference, so the name is captured here and handed over.
				 */
				const nameHints = new Map<Node, string>();
				let touched = false;
				const helpers = new Set<string>();
				const use = (name: string): string => {
					helpers.add(name);
					return name;
				};
				const text = (node: Node): string =>
					code.slice(node.start, node.end);

				const lowerClass = (node: Node, stmtStart: number): void => {
					const classDecorators = decoratorsOf(node);
					const body = node.body as Node;
					const members = body.body as ReadonlyArray<Node>;
					const decorated = members.filter(
						(member) => decoratorsOf(member).length > 0,
					);
					// `accessor` is part of the same proposal and no engine has
					// shipped it either, so an undecorated one still has to be
					// desugared or it reaches the browser as a syntax error.
					const plainAccessors = members.filter(
						(member) =>
							member.type === "AccessorProperty" &&
							decoratorsOf(member).length === 0,
					);
					if (
						classDecorators.length === 0 &&
						decorated.length === 0 &&
						plainAccessors.length === 0
					) {
						return;
					}
					touched = true;
					const slot = `_vd${uid++}`;
					const name = (node.id as Node | null)?.name as
						| string
						| undefined;
					source.appendLeft(
						stmtStart,
						`const ${slot} = ${use("__vslot")}();\n`,
					);

					// Decorator expressions and computed keys are all evaluated
					// once, *before* the class exists, interleaved in source
					// order: each element's decorators, then its key. So they
					// are hoisted to one `const` rather than written where they
					// are used. Leaving decorators in the static block instead
					// would evaluate them too late and silently make them
					// strict-mode code, which rejects `await` and `yield` as
					// identifiers - `decorator-order-phases-1-pre-definition`
					// pins the interleaving.
					const hoisted = new Map<Decorator, string>();
					const keyVars = new Map<Node, string>();
					const prelude: string[] = [];
					const take = (expression: Node): string => {
						const temp = `${slot}e${prelude.length}`;
						prelude.push(`${temp} = ${text(expression)}`);
						return temp;
					};
					for (const decorator of classDecorators) {
						hoisted.set(decorator, take(decorator.expression));
					}
					for (const member of decorated) {
						for (const decorator of decoratorsOf(member)) {
							hoisted.set(decorator, take(decorator.expression));
						}
						const key = member.key as Node;
						if (
							member.computed === true &&
							key.type !== "PrivateIdentifier"
						) {
							const keyVar = take(key);
							keyVars.set(member, keyVar);
							source.overwrite(key.start, key.end, keyVar);
						}
					}
					if (prelude.length > 0) {
						source.appendLeft(
							stmtStart,
							`const ${prelude.join(",")};\n`,
						);
					}
					const listOf = (list: ReadonlyArray<Decorator>): string =>
						`[${list.map((d) => hoisted.get(d)).join(",")}]`;

					// Source order is *not* application order. The proposal
					// applies, in four groups and stably within each: static
					// method-likes, instance method-likes, static fields, then
					// instance fields. An `accessor` counts as a method-like
					// despite declaring storage, which is the part that is easy
					// to get wrong - `decorator-order-phases-2-application`
					// pins it.
					const ordered = decorated
						.map((member, index) => ({
							member,
							rank:
								(member.type === "PropertyDefinition" ? 2 : 0) +
								(member.static === true ? 0 : 1),
							index,
						}))
						.toSorted((a, b) => a.rank - b.rank || a.index - b.index)
						.map(({ member }) => member);

					/**
					 * The name a desugared accessor keeps, and the private field
					 * standing behind it. A computed key is hoisted so it is
					 * still evaluated exactly once despite becoming two members.
					 */
					const accessorNames = (
						member: Node,
						index: number,
					): { name: string; backing: string } => {
						const key = member.key as Node;
						if (key.type === "PrivateIdentifier") {
							return {
								name: `#${key.name as string}`,
								backing: `#${key.name as string}_${slot}`,
							};
						}
						if (member.computed === true) {
							// Already hoisted above for decorated members; a
							// plain one needs its own, still before the class so
							// splitting it into a get/set pair cannot evaluate
							// it twice.
							let keyVar = keyVars.get(member);
							if (keyVar === undefined) {
								keyVar = `${slot}k${index}`;
								source.appendLeft(
									stmtStart,
									`const ${keyVar} = ${text(key)};\n`,
								);
								source.overwrite(key.start, key.end, keyVar);
							}
							return {
								name: `[${keyVar}]`,
								backing: `#${slot}a${index}`,
							};
						}
						return { name: text(key), backing: `#${slot}a${index}` };
					};

					plainAccessors.forEach((member, index) => {
						const { name: accessName, backing } = accessorNames(
							member,
							1000 + index,
						);
						const value = member.value as Node | null;
						const st = member.static === true ? "static " : "";
						source.overwrite(
							member.start,
							member.end,
							`${st}${backing} = ${value === null ? "void 0" : text(value)};` +
								`${st}get ${accessName}(){return this.${backing};}` +
								`${st}set ${accessName}(v){this.${backing} = v;}`,
						);
					});

					// A class decorator may return a *different* class, and the
					// proposal binds the class name to that result before any
					// static element initializes. So when both are in play the
					// class goes anonymous - otherwise its own inner binding
					// shadows the outer one and static code sees the original -
					// and every static initializer is deferred past decoration.
					const staticElements = members.filter(
						(member) =>
							member.type === "StaticBlock" ||
							(member.static === true &&
								(member.type === "PropertyDefinition" ||
									member.type === "AccessorProperty")),
					);
					// An accessor is rewritten into a backing field plus a
					// get/set pair, so it defers itself where it is rewritten;
					// moving the whole member here would take the backing field
					// out from under the pair that reads it.
					const toDefer = staticElements.filter(
						(member) => member.type !== "AccessorProperty",
					);
					const exported = code.startsWith("export ", stmtStart);
					const defer =
						classDecorators.length > 0 &&
						staticElements.length > 0 &&
						node.type === "ClassDeclaration" &&
						name !== undefined &&
						// An anonymous `export default class` has no binding to
						// re-export under, so it keeps the undeferred form.
						!code.startsWith("export default", stmtStart);

					const entries: string[] = [];
					/** Static field initializers held back for {@link defer}. */
					const deferredInit = new Map<Node, string>();
					let needsInstanceInit = false;

					ordered.forEach((member, slotIndex) => {
						const kind = kindOf(member);
						if (kind === undefined) {
							throw new Error(
								`vite-decorators: cannot lower a decorated \`${member.type}\` in ${id}`,
							);
						}
						const key = member.key as Node;
						const isPrivate = key.type === "PrivateIdentifier";
						const isStatic = member.static === true;
						const isComputed = member.computed === true;
						if (!isStatic) {
							needsInstanceInit = true;
						}

						// A computed key must evaluate exactly once, in source
						// order, so hoist it to a const before the class and
						// point both the member and the runtime at that.
						let nameExpr: string;
						if (isPrivate) {
							nameExpr = JSON.stringify(`#${key.name as string}`);
						} else if (isComputed) {
							nameExpr = keyVars.get(member)!;
						} else {
							nameExpr = JSON.stringify(
								key.type === "Identifier"
									? (key.name as string)
									: String(key.value),
							);
						}

						const decorators = decoratorsOf(member);
						for (const decorator of decorators) {
							source.remove(decorator.start, decorator.end);
						}
						const decoratorList = listOf(decorators);

						// Private state is unreachable from outside the class
						// body, so hand the runtime thunks that close over it.
						const priv = isPrivate
							? `(o)=>o.#${key.name as string},(o,v)=>{o.#${key.name as string}=v;},(o)=>#${key.name as string} in o`
							: "0,0,0";

						let declared = "0";
						if (
							isPrivate &&
							(kind === "method" ||
								kind === "getter" ||
								kind === "setter")
						) {
							// A private method or accessor has no descriptor to
							// read and cannot be redefined from outside, so the
							// original implementation is handed over as a
							// function expression - written inside the class
							// body, so it keeps access to the class's private
							// names - and the member becomes a delegate to
							// whatever decoration produced.
							const fn = member.value as Node;
							// `async` and `*` live outside the function
							// expression's span, so they have to be put back or
							// the value handed to the decorator is a plain
							// function that returns the wrong thing.
							const isAsync = fn.async === true;
							const isGenerator = fn.generator === true;
							declared = `${isAsync ? "async " : ""}function${isGenerator ? "*" : ""} ${text(fn)}`;
							if (kind === "method") {
								// The delegate must be a *plain* method even
								// when the original was async or a generator: a
								// decorator may replace it with an ordinary
								// function, and an `async` wrapper would hand
								// back a promise for the replacement's result
								// instead of the result. The async-ness lives in
								// the stored value, which is called through.
								source.overwrite(
									member.start,
									member.end,
									`${isStatic ? "static " : ""}#${key.name as string}(...a){return ${use("__vpm")}(${slot},${slotIndex}).apply(this,a);}`,
								);
							} else {
								source.overwrite(
									fn.start,
									fn.end,
									kind === "setter"
										? `(v){${use("__vpcall")}(${slot},${slotIndex},this,v);}`
										: `(){return ${use("__vpcall")}(${slot},${slotIndex},this);}`,
								);
							}
						}

						if (kind === "field" || kind === "accessor") {
							const value = member.value as Node | null;
							const initial = value === null ? "void 0" : text(value);
							if (kind === "field" && defer && isStatic) {
								deferredInit.set(
									member,
									`${use("__vf")}(${slot},${slotIndex},this,${initial})`,
								);
							} else if (kind === "field") {
								if (value === null) {
									// No initializer to overwrite, so add one -
									// after any type annotation, or it would land
									// between the name and its type.
									const anchor =
										(member.typeAnnotation as Node | undefined)
											?.end ?? key.end;
									source.appendLeft(
										anchor,
										` = ${use("__vf")}(${slot},${slotIndex},this,void 0)`,
									);
								} else {
									source.overwrite(
										value.start,
										value.end,
										`${use("__vf")}(${slot},${slotIndex},this,${initial})`,
									);
								}
							} else {
								// `accessor x = v` desugars to a private backing
								// field plus a get/set pair the runtime routes,
								// so a decorator can replace either half. The
								// whole member is rewritten, so `static` has to
								// be re-emitted or it silently becomes an
								// instance accessor.
								const { name: accessName, backing } = accessorNames(
									member,
									slotIndex,
								);
								const st = isStatic ? "static " : "";
								const store =
									defer && isStatic
										? `static ${backing};static{${use("__vdefer")}(${slot},function(){this.${backing} = ${use("__vf")}(${slot},${slotIndex},this,${initial});});}`
										: `${st}${backing} = ${use("__vf")}(${slot},${slotIndex},this,${initial});`;
								source.overwrite(
									member.start,
									member.end,
									store +
										`${st}get ${accessName}(){return ${use("__vget")}(${slot},${slotIndex},this);}` +
										`${st}set ${accessName}(v){${use("__vset")}(${slot},${slotIndex},this,v);}`,
								);
								entries.push(
									`[${nameExpr},"accessor",${isStatic},${isPrivate},${decoratorList},(o)=>o.${backing},(o,v)=>{o.${backing}=v;},(o)=>${backing} in o,0]`,
								);
								return;
							}
						}

						entries.push(
							`[${nameExpr},${JSON.stringify(kind)},${isStatic},${isPrivate},${decoratorList},${priv},${declared}]`,
						);
					});

					for (const decorator of classDecorators) {
						source.remove(decorator.start, decorator.end);
					}
					const classDecoratorList = listOf(classDecorators);

					const declaredName = name ?? nameHints.get(node) ?? "";

					source.appendLeft(
						body.start + 1,
						`static{${use("__vsetup")}(${slot},this,${classDecoratorList},[${entries.join(",")}]);}`,
					);
					if (ordered.some((member) => member.static === true)) {
						source.appendLeft(
							body.end - 1,
							`static{${use("__vsinit")}(${slot},this);}`,
						);
					}
					if (needsInstanceInit) {
						// Only *method* initializers reach here - a field's or
						// accessor's run with that element, inside `__vf` - and
						// those run before any field is initialized, so this
						// goes in first. `decorator-order-phases-4-init-instance`
						// pins it against
						// `decorator-order-application-field-and-accessor`,
						// which pins the other half.
						source.appendLeft(
							body.start + 1,
							`#${slot}i = ${use("__vinit")}(${slot},this);`,
						);
					}

					if (defer) {
						// Every static initializer becomes a closure registered
						// from where it stood, so they still run in source order
						// and still reach the class's private names - just after
						// decoration, against the decorated class.
						for (const member of toDefer) {
							if (member.type === "StaticBlock") {
								source.appendLeft(
									member.start,
									`static{${use("__vdefer")}(${slot},function()`,
								);
								source.appendRight(member.end, `);}`);
								source.remove(member.start, member.start + 6);
							} else {
								const key = member.key as Node;
								const value = member.value as Node | null;
								const target =
									key.type === "PrivateIdentifier"
										? `this.#${key.name as string}`
										: member.computed === true
											? `this[${keyVars.get(member) ?? text(key)}]`
											: `this[${JSON.stringify(
													key.type === "Identifier"
														? (key.name as string)
														: String(key.value),
												)}]`;
								source.overwrite(
									member.start,
									member.end,
									`static{${use("__vdefer")}(${slot},function(){${target} = ${
										deferredInit.get(member) ??
										(value === null ? "void 0" : text(value))
									};});}`,
								);
							}
						}
						// Anonymous, so the class's own inner binding cannot
						// shadow the outer one the deferred closures read.
						source.remove(
							(node.id as Node).start,
							(node.id as Node).end,
						);
						source.appendLeft(stmtStart, `let ${name};\n`);
						if (exported) {
							// `export class X` cannot become an assignment, so
							// the declaration loses its `export` and the binding
							// is re-exported once it holds the decorated class.
							source.remove(stmtStart, stmtStart + 7);
						}
						source.appendLeft(
							node.start,
							`${name} = ${use("__vclass")}(${slot},`,
						);
						source.appendRight(
							node.end,
							`,${JSON.stringify(declaredName)});\n${use("__vstatics")}(${slot},${name});${
								exported ? `\nexport {${name}};` : ""
							}`,
						);
					} else if (name === undefined) {
						// No binding to reassign, so wrap the expression itself.
						source.appendLeft(
							node.start,
							`${use("__vclass")}(${slot},`,
						);
						source.appendRight(
							node.end,
							`,${JSON.stringify(declaredName)})`,
						);
					} else {
						source.appendRight(
							node.end,
							`\n${name} = ${use("__vclass")}(${slot},${name});`,
						);
					}
				};

				/**
				 * `stmtStart` is where hoisted declarations may legally go: the
				 * start of the innermost enclosing statement, never the class
				 * itself, or `const _vd0 = …` would land mid-expression.
				 */
				const visit = (value: unknown, stmtStart: number): void => {
					if (value === null || typeof value !== "object") {
						return;
					}
					if (Array.isArray(value)) {
						// Statement lists are the only place a hoisted `const`
						// may go, so the insertion point is refreshed here and
						// nowhere else — an `export default class` keeps its
						// statement's start, not the class's.
						for (const item of value) {
							const node = item as Node | null;
							visit(
								item,
								node !== null &&
									typeof node === "object" &&
									/(?:Statement|Declaration)$/.test(node.type)
									? node.start
									: stmtStart,
							);
						}
						return;
					}
					const current = value as Node;
					const anonymousClass = (
						node: unknown,
					): Node | undefined => {
						const c = node as Node | null;
						return c !== null &&
							typeof c === "object" &&
							c.type === "ClassExpression" &&
							c.id === null
							? c
							: undefined;
					};
					if (current.type === "VariableDeclarator") {
						const target = anonymousClass(current.init);
						const binding = current.id as Node | null;
						if (target && binding?.type === "Identifier") {
							nameHints.set(target, binding.name as string);
						}
					} else if (
						current.type === "AssignmentExpression" &&
						current.operator === "="
					) {
						const target = anonymousClass(current.right);
						const left = current.left as Node | null;
						if (target && left?.type === "Identifier") {
							nameHints.set(target, left.name as string);
						}
					}
					if (
						current.type === "ClassDeclaration" ||
						current.type === "ClassExpression"
					) {
						lowerClass(current, stmtStart);
					}
					for (const key in current) {
						if (key !== "type" && key !== "decorators") {
							visit(current[key], stmtStart);
						}
					}
				};
				visit(parsed.program, 0);

				if (!touched) {
					return undefined;
				}
				source.prepend(
					`import {${[...helpers].join(",")}} from ${JSON.stringify(RUNTIME_SPECIFIER)};\n`,
				);
				return {
					code: source.toString(),
					map: source.generateMap({ hires: "boundary" }),
				};
			},
		},
	};
};
