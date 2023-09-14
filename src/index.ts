import { node, run } from "./markup";
import { render } from "./render";

type ChangeEvent<T extends Element> = Event &
	Readonly<{
		currentTarget: T;
	}>;

const clear = (node: Element) => {
	while (node.lastChild) node.lastChild.remove();
	return node;
};

const input = document.createElement("textarea");
input.id = "input";
const output = document.createElement("div");
output.id = "output";
const raw = document.createElement("pre");
raw.id = "raw";
const rendered = document.createElement("div");
rendered.id = "rendered";
const style = document.createElement("style");
output.append(rendered, raw);

style.textContent = `
html, body {
	display: flex;
	width: 100vw;
	height: 100vh;
	flex-direction: column;
	font-size: 20px;
	tab-size: 2;
}

#input, #output, #raw, #rendered {
	display: flex;
	flex-grow: 1;
}

#input {
	resize: none;
	font: inherit;
	font-family: "Fira Code";
	padding: 1rem;
}

#output {
	height: 50%;
}

#rendered {
	align-items: center;
	justify-content: center;
	background-image: linear-gradient(45deg, #00000007 25%, transparent 25%), linear-gradient(-45deg, #00000007 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #00000007 75%), linear-gradient(-45deg, transparent 75%, #00000007 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}

#raw {
	font-family: "Fira Code";
	overflow: auto;
}
`.trim();

document.head.append(style);

const update = (value: string) => {
	try {
		const parsed = run(node)(value);
		clear(rendered).append(render(parsed));
		clear(raw).append(JSON.stringify(parsed, null, 2));
		raw.removeAttribute("style");
	} catch (error: any) {
		clear(rendered);
		clear(raw).append(error.stack);
		raw.style.background = "red";
		raw.style.color = "yellow";
		raw.style.padding = "1rem";
		raw.style.display = "flex";
		raw.style.justifyContent = "center";
		raw.style.alignItems = "center";
	}
};

(input as any).addEventListener(
	"input",
	({ currentTarget: { value } }: ChangeEvent<HTMLTextAreaElement>) =>
		update(value)
);

update(
	(input.textContent = `
<canvas fill="rgb(200,200,200)">
	<row>
		<column fill="grey" color="black" radius={5} padding={32}>
			<box fill="red">Box 1</box>
			<box fill="green">Box 2</box>
			<box fill="blue">Box 3</box>
		</column>
		<column fill="grey" color="black" radius={5} padding={32}>
			<box fill="red">Box 4</box>
			<box fill="green">Box 5</box>
			<box fill="blue">Box 6</box>
		</column>
	</row>
</canvas>
`.trim())
);

document.body.append(output, input);
