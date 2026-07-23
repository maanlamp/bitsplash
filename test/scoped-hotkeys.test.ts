import { describe, expect, test } from "bun:test";
import { injectDocument } from "../src/editor/window/use-scoped-hotkeys";

const doc = { id: "owner" } as unknown as Document;
const other = { id: "main" } as unknown as Document;

describe("injectDocument", () => {
	test("creates an options object carrying the document when none is given", () => {
		const [options, deps] = injectDocument(doc);
		expect(options.document).toBe(doc);
		expect(deps).toBeUndefined();
	});

	test("preserves an existing options object and adds the document", () => {
		const [options, deps] = injectDocument(doc, {
			enabled: false,
			preventDefault: true,
		});
		expect(options).toEqual({
			enabled: false,
			preventDefault: true,
			document: doc,
		});
		expect(deps).toBeUndefined();
	});

	test("keeps a fourth-argument dependency array intact", () => {
		const dependencies = ["a", "b"];
		const [options, deps] = injectDocument(
			doc,
			{ enabled: true },
			dependencies,
		);
		expect(options).toEqual({ enabled: true, document: doc });
		expect(deps).toBe(dependencies);
	});

	test("treats a third-argument array as dependencies, not options", () => {
		const dependencies = [1, 2];
		const [options, deps] = injectDocument(doc, dependencies);
		expect(options).toEqual({ document: doc });
		expect(deps).toBe(dependencies);
	});

	test("the injected document always wins over a caller-supplied one", () => {
		const [options] = injectDocument(doc, { document: other });
		expect(options.document).toBe(doc);
	});
});
