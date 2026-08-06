import {
	type InputStep,
	QA_ENDPOINT,
	type QaResponse,
} from "../qa/qa-protocol";

const DEFAULT_ORIGIN = "https://localhost:5173";

const USAGE = `bun run scripts/probe.ts <command> [options]

  entities [--with <Component,...>]   dump entities, optionally only those carrying every named component
  profile --frames <n>                per-system update timings over n frames (CPU only)
  render  --frames <n>                renderer batching counters over n frames
  frametime --frames <n>              wall-clock interval between presented frames
  input --script <steps>              drive the real input path

  --origin <url>                      dev server to reach (default ${DEFAULT_ORIGIN})

Script steps are \`KEY+KEY:frames\` separated by commas; an empty key list is a
wait, which is how a step releases a key. Activation happens on the press edge,
so two presses of the same key need a gap between them.

An \`@\` prefix dispatches a real DOM KeyboardEvent code instead of feeding the
engine snapshot, for keys the shell binds on \`window\` rather than through input —
pause, quicksave and quickload. Those codes are case-sensitive.

  input --script 'ARROWDOWN:2,:20,ENTER:2,:300'   focus a menu button, start a run
  input --script '@Escape:2,:60'                  open the pause menu

Nothing is focused on the main menu at rest, so a script has to move focus before
it can confirm.

Input is injected into the snapshot the host already sampled, so it travels the
same path a player's does — normaliser, dispatcher, focus, activation. Nothing
reaches past the UI, which is the point: a build that passes every headless
fixture can still be unplayable.

\`profile\` measures CPU inside the update span; \`frametime\` is what a frame-rate
target is actually about. Use both — they answer different questions.

Frame-driven commands need frames, so keep the game window visible: Chromium
throttles requestAnimationFrame in a backgrounded window. The probe only exists
under \`bun run dev\`; a built game has no bridge to talk to.`;

const fail: (message: string) => never = (message) => {
	console.error(message);
	process.exit(1);
};

const flag = (
	args: ReadonlyArray<string>,
	name: string,
): string | undefined => {
	const at = args.indexOf(`--${name}`);
	return at >= 0 ? args[at + 1] : undefined;
};

const frameCount = (args: ReadonlyArray<string>): number => {
	const raw = flag(args, "frames") ?? "60";
	const frames = Number(raw);
	if (!Number.isInteger(frames) || frames < 1) {
		fail(`--frames wants a positive integer, got "${raw}"`);
	}
	return frames;
};

/**
 * Component names are validated by the page, not here: the `@serializable`
 * registry is populated by decorator side-effects in modules only the running
 * app imports, so the build under test is the sole authority on what a valid
 * name is. A typo comes back as a loud error listing the registered set.
 */
const componentNames = (
	args: ReadonlyArray<string>,
): ReadonlyArray<string> => {
	const raw = flag(args, "with");
	return raw
		? raw
				.split(",")
				.map((name) => name.trim())
				.filter((name) => name.length > 0)
		: [];
};

/**
 * Parse `KEY+KEY:frames,...` into steps. An empty key list is a wait, which is
 * how a script releases a key — the UI activates on the press edge, so two
 * consecutive presses of the same key need a gap between them.
 *
 * @example
 * parseScript("ENTER:2,:120,ESCAPE:2,:60"); // start a run, wait, pause, settle
 */
const parseScript = (raw: string): ReadonlyArray<InputStep> =>
	raw
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
		.map((part) => {
			const [keysRaw, framesRaw] = part.split(":");
			const frames = Number(framesRaw ?? "1");
			if (!Number.isInteger(frames) || frames < 1) {
				fail(`step "${part}" wants a positive frame count after ":"`);
			}
			const tokens = (keysRaw ?? "")
				.split("+")
				.map((key) => key.trim())
				.filter((key) => key.length > 0);
			// `@Escape` is a DOM KeyboardEvent code and keeps its case; a bare key
			// goes to the engine snapshot, which upper-cases.
			const dom = tokens
				.filter((key) => key.startsWith("@"))
				.map((key) => key.slice(1));
			const keys = tokens
				.filter((key) => !key.startsWith("@"))
				.map((key) => key.toUpperCase());
			return { keys, dom, frames };
		});

const ask = async (
	origin: string,
	body: object,
): Promise<QaResponse> => {
	let reply: Response;
	try {
		reply = await fetch(`${origin}${QA_ENDPOINT}`, {
			method: "POST",
			body: JSON.stringify(body),
			// The dev server runs on a locally-generated certificate.
			tls: { rejectUnauthorized: false },
		} as RequestInit);
	} catch (cause) {
		return fail(
			`could not reach the dev server at ${origin} — is \`bun run dev\` running?\n${String(cause)}`,
		);
	}
	if (!reply.ok) {
		return fail(`${reply.status}: ${await reply.text()}`);
	}
	return (await reply.json()) as QaResponse;
};

const mean = (values: ReadonlyArray<number>): number =>
	values.reduce((sum, value) => sum + value, 0) /
	Math.max(1, values.length);

const report = (response: QaResponse): void => {
	if (!response.ok) {
		fail(response.error);
		return;
	}
	if (response.kind === "entities") {
		console.log(`scene: ${response.scene ?? "(none)"}`);
		console.log(`entities: ${response.entities.length}`);
		for (const entity of response.entities) {
			const types = entity.components.map((c) => c.type).join(", ");
			console.log(`  #${entity.id}  ${types}`);
		}
		return;
	}
	if (response.kind === "input") {
		console.log(
			`script finished; scene: ${response.scene ?? "(none)"}`,
		);
		return;
	}
	if (response.kind === "frametime") {
		const i = response.intervals;
		console.log(`frames: ${i.frames}`);
		console.log(
			`frame interval ms: mean ${i.meanMs.toFixed(3)}  p50 ${i.p50Ms.toFixed(3)}` +
				`  p95 ${i.p95Ms.toFixed(3)}  p99 ${i.p99Ms.toFixed(3)}  max ${i.maxMs.toFixed(3)}`,
		);
		console.log(`mean fps: ${i.fpsMean.toFixed(1)}`);
		return;
	}
	if (response.kind === "profile") {
		const spans = response.frames.map((f) => f.updateSpanMs);
		console.log(`frames: ${spans.length}`);
		console.log(
			`update span ms: mean ${mean(spans).toFixed(3)}  min ${Math.min(...spans).toFixed(3)}  max ${Math.max(...spans).toFixed(3)}`,
		);
		const totals = new Map<string, Array<number>>();
		for (const frame of response.frames) {
			for (const system of frame.systems) {
				const list = totals.get(system.label) ?? [];
				list.push(system.ms);
				totals.set(system.label, list);
			}
		}
		const ranked = [...totals].sort(
			(a, b) => mean(b[1]) - mean(a[1]),
		);
		for (const [label, samples] of ranked) {
			console.log(`  ${mean(samples).toFixed(3)} ms  ${label}`);
		}
		return;
	}
	const frames = response.frames;
	console.log(`frames: ${frames.length}`);
	const column = (
		pick: (counters: (typeof frames)[number]) => number,
	): string => {
		const values = frames.map(pick);
		const min = Math.min(...values);
		const max = Math.max(...values);
		return min === max
			? `${min}`
			: `${min}..${max} (mean ${mean(values).toFixed(1)})`;
	};
	console.log(`  draw calls:      ${column((c) => c.drawCalls)}`);
	console.log(
		`  quad vertices:   ${column((c) => c.quadVertexCount)}`,
	);
	console.log(`  layers:          ${column((c) => c.layerCount)}`);
	console.log(
		`  scratch freed:   ${column((c) => c.scratchTargetsDisposed)}`,
	);
};

const main = async (): Promise<void> => {
	const args = process.argv.slice(2);
	const command = args[0];
	const origin = flag(args, "origin") ?? DEFAULT_ORIGIN;
	if (!command || command === "--help" || command === "-h") {
		console.log(USAGE);
		return;
	}
	if (command === "entities") {
		report(
			await ask(origin, {
				kind: "entities",
				with: componentNames(args),
			}),
		);
		return;
	}
	if (command === "profile" || command === "render") {
		report(
			await ask(origin, { kind: command, frames: frameCount(args) }),
		);
		return;
	}
	if (command === "frametime") {
		report(
			await ask(origin, {
				kind: "frametime",
				frames: frameCount(args),
			}),
		);
		return;
	}
	if (command === "input") {
		const script = flag(args, "script");
		if (!script) {
			fail(
				"input wants --script, e.g. --script 'ENTER:2,:120,ESCAPE:2,:60'",
			);
		}
		report(
			await ask(origin, {
				kind: "input",
				steps: parseScript(script),
			}),
		);
		return;
	}
	fail(`unknown command "${command}"\n\n${USAGE}`);
};

await main();
