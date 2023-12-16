import { program, run } from "./markup.js";
import { render } from "./render.js";

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
	height: 40%;
}

#output>* {
	width: 50%;
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

const update = () => {
	try {
		const parsed = run(program)(
			document.querySelector<HTMLTextAreaElement>("#input")!.value!
		);
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

input.textContent = `
<game hover="4px orange">
	<column hover="2px red">
		<row hover="2px green">
			<column
				hover="2px blue"
				click="white"
				fill="grey"
				color="white"
				radius={5}
				padding={32}
				gap={8}
				alignCross="end">
				<box fill="red">Lorem</box>
				<box fill="green">Ipsum</box>
				<box fill="blue">dolor</box>
			</column>
			<row
				hover="2px yellow"
				click="white"
				fill="rgb(150,150,150)"
				color="black"
				radius={5}
				padding={32}
				alignCross="center"
				gap={16}>
				<box fill="cyan">sit</box>
				<box fill="magenta">amet</box>
				<box fill="yellow">consectetur</box>
			</row>
		</row>
			<column
				hover="2px cyan"
				click="white"
				fill="rgb(220,220,220)"
				color="white"
				radius={5}
				padding={8}
				alignCross="end">
				<box fill="orange">Lorem</box>
				<box fill="teal">Ipsum</box>
				<box fill="purple">dolor</box>
			</column>
	</column>
</game>
`.trim();

(input as any).addEventListener("input", update);
document.body.append(output, input);
update();
