type ParseError = Readonly<{
	message: string;
	offset: number;
}>;

const error = (message: string, offset: number): ParseError => ({
	message,
	offset,
});

const isParseError = (value: any): value is ParseError => "offset" in value;

export type TextNode = string;

export type ElementNode = Readonly<{
	name: string;
	children: ReadonlyArray<Node>;
	attributes: Readonly<Record<string, any>>;
}>;

export type Node = TextNode | ElementNode;

type Result = readonly [number, Node];

type Parser = (input: string, offset?: number) => Result;

const expect = (expected: string, input: string, offset = 0) => {
	if (input.slice(offset, offset + expected.length) !== expected)
		throw error(`Expected "${expected}"`, offset);
	return expected.length;
};

const peek = (expected: string, input: string, offset = 0) =>
	input.slice(offset, offset + expected.length) === expected;

const whitespace = (input: string, offset = 0) =>
	input.slice(offset).match(/^\s+/)?.[0].length ?? 0;

export const program = (input: string, offset = 0): Result => {
	offset += whitespace(input, offset);
	const children = [];
	while (true) {
		try {
			const [newOffset, child] = node(input, offset);
			children.push(child);
			offset = newOffset;
			offset += whitespace(input, offset);
		} catch (error) {
			if (!isParseError(error)) throw error;
			break;
		}
	}
	offset += whitespace(input, offset);
	return [offset, { name: "program", children, attributes: {} }];
};

const node = (input: string, offset = 0): Result => {
	if (!peek("<", input, offset)) return text(input, offset);
	offset += expect("<", input, offset);
	offset += whitespace(input, offset);
	const name = input.slice(offset).match(/^[a-z][-\w]*/i)?.[0];
	if (!name) throw error(`Expected a name`, offset);
	offset += name.length;
	offset += whitespace(input, offset);
	const [newOffset, attrs] = attributes(input, offset);
	offset = newOffset;
	offset += whitespace(input, offset);
	if (peek("/", input, offset)) {
		offset += 1;
		offset += whitespace(input, offset);
		offset += expect(">", input, offset);
		return [offset, { name, attributes: attrs, children: [] }];
	}
	offset += expect(">", input, offset);
	offset += whitespace(input, offset);
	const children = [];
	while (true) {
		try {
			const [newOffset, child] = node(input, offset);
			children.push(child);
			offset = newOffset;
			offset += whitespace(input, offset);
		} catch (error) {
			if (!isParseError(error)) throw error;
			break;
		}
	}
	offset += whitespace(input, offset);
	offset += expect("<", input, offset);
	offset += whitespace(input, offset);
	offset += expect("/", input, offset);
	offset += expect(name, input, offset);
	offset += whitespace(input, offset);
	offset += expect(">", input, offset);
	return [offset, { name, attributes: attrs, children }] as const;
};

const text = (input: string, offset = 0) => {
	const before = offset;
	while (true) {
		if (offset >= input.length) throw error(`Unexpected end of input`, offset);
		if (peek("\\<", input, offset)) offset += 2;
		if (peek("<", input, offset)) break;
		else offset += 1;
	}
	return [offset, input.slice(before, offset).trim()] as const;
};

const attributes = (input: string, offset = 0) => {
	const attrs = [];
	while (offset < input.length) {
		try {
			const [newOffset, attr] = attribute(input, offset);
			attrs.push(attr);
			offset = newOffset;
			offset += whitespace(input, offset);
		} catch (error) {
			if (isParseError(error)) break;
			throw error;
		}
	}
	return [offset, Object.fromEntries(attrs)] as const;
};

const attribute = (input: string, offset = 0) => {
	const name = input.slice(offset).match(/^[a-z][-\w]*/i)?.[0];
	if (!name) throw error(`Expected a name`, offset);
	offset += name.length;
	offset += whitespace(input, offset);
	if (peek("=", input, offset)) {
		offset += expect("=", input, offset);
		offset += whitespace(input, offset);
		const [newOffset, value] = attributeValue(input, offset);
		return [newOffset, [name, value]] as const;
	} else {
		return [offset, [name, true]] as const;
	}
};

const attributeValue = (input: string, offset = 0) => {
	const delimiter = input[offset].match(/['"]/)?.[0];
	if (delimiter) {
		offset += 1;
		const start = offset;
		while (input[offset] !== delimiter) {
			offset += 1;
			if (offset >= input.length)
				throw error(`Unexpected end of input`, offset);
		}
		return [offset + 1, input.slice(start, offset)] as const;
	}
	offset += expect("{", input, offset);
	const length = matchBalancedChars("{}", input.slice(offset - 1));
	const value = eval(input.slice(offset, offset + length));
	offset += length;
	offset += expect("}", input, offset);
	return [offset, value] as const;
};

const matchBalancedChars = ([start, end]: string, input: string) => {
	if (start === end) throw new Error("Start and end chars must be different.");
	let index = 0;
	let depth = 0;
	if (input[index++] !== start)
		throw new Error(`Unexpected "${input[index]}".`);
	while (true) {
		if (index >= input.length) {
			throw new Error("Unexpected end of input.");
		} else if (input[index] === start) {
			index += 1;
			depth += 1;
		} else if (input[index] === end) {
			if (depth === 0) return index - 1;
			index += 1;
			depth -= 1;
		} else {
			index += 1;
		}
	}
};

export const run = (parser: Parser) => (input: string) => {
	try {
		const [offset, result] = parser(input);
		if (offset < input.length)
			throw error(`Unexpected "${input[offset]}"`, offset);
		return result;
	} catch (error) {
		if (!isParseError(error)) throw error;
		const slice = input.slice(0, error.offset);
		const lineNo = (slice.match(/\n/g)?.[0].length ?? 0) + 1;
		const lastLF = slice.lastIndexOf("\n") + 1;
		const col = error.offset - lastLF;
		const line = input.slice(
			lastLF,
			input.slice(lastLF).indexOf("\n") + lastLF
		);

		throw new Error(
			error.message +
				"\n\n" +
				lineNo +
				" | " +
				line +
				"\n" +
				" ".repeat(col + lineNo.toString().length + 3) +
				"^"
		);
	}
};
