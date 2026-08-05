import { QA_ENDPOINT, type QaResponse } from "../qa/qa-protocol";

const DEFAULT_ORIGIN = "https://localhost:5173";

const USAGE = `bun run scripts/probe.ts <command> [options]

  entities [--with <Component,...>]   dump entities, optionally only those carrying every named component
  profile --frames <n>                per-system update timings over n frames
  render  --frames <n>                renderer batching counters over n frames

  --origin <url>                      dev server to reach (default ${DEFAULT_ORIGIN})

The probe measures; it does not reproduce. Scripted input was built and dropped
because its runs diverged — drive reproduction from headless fixtures instead.

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
	console.log(
		`  tile vertices:   ${column((c) => c.tileVertexCount)}`,
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
	fail(`unknown command "${command}"\n\n${USAGE}`);
};

await main();
