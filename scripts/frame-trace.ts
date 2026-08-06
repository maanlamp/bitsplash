/**
 * Presented-frame timing, from Chromium's own compositor trace.
 *
 * `scripts/probe.ts frametime` measures the interval between the page's
 * `requestAnimationFrame` callbacks. That is main-thread cadence, and it keeps to
 * schedule even while the compositor falls behind — so a page-side reading can say
 * 1.6ms while the picture visibly stutters. This attaches over CDP instead and
 * counts the compositor's own frame events, which is what actually reaches the
 * screen.
 *
 *   BITSPLASH_QA=1 bunx electron src/desktop/game.cjs      # enables the CDP port
 *   bun run scripts/frame-trace.ts --seconds 5
 *
 * Options:
 *   --seconds <n>   trace duration (default 5)
 *   --port <n>      CDP port (default 9222, matches BITSPLASH_CDP_PORT)
 *   --raw           also list every trace event name seen, with counts
 *
 * Chromium renames frame trace events between versions, so rather than trust one
 * name and silently report zero, this tallies every known candidate and prints
 * what it actually found.
 *
 * **Read `Display::DrawAndSwap`.** Measured on Electron 42, it is the display
 * compositor actually swapping to screen, and it agrees exactly with
 * `BenchmarkInstrumentation::DisplayRenderingStats`. The other rows are not
 * presentation and will flatter a slow frame:
 *
 * - `DrawFrame` is the renderer's begin-frame. With a canvas-only scene it tracks
 *   presentation within a few percent, but with many composited layers it ran 3x
 *   high (531/s against 173/s presented).
 * - `PipelineReporter` is an async span, so it counts begin and end — roughly
 *   double the frame count.
 * - `Graphics.Pipeline` has several steps per frame and is not a frame counter.
 */

const arg = (name: string, fallback: string): string => {
	const at = process.argv.indexOf(`--${name}`);
	return at >= 0 ? (process.argv[at + 1] ?? fallback) : fallback;
};
const has = (name: string): boolean =>
	process.argv.includes(`--${name}`);

const seconds = Number(arg("seconds", "5"));
const port = arg("port", process.env.BITSPLASH_CDP_PORT || "9222");
const origin = `http://127.0.0.1:${port}`;

/**
 * Event names that have signalled a presented frame across Chromium versions.
 * `Graphics.Pipeline`/`PipelineReporter` are the viz compositor's own async
 * spans; `DrawFrame` is what the DevTools timeline draws its frame bars from.
 */
const CANDIDATES = [
	"DrawFrame",
	"PipelineReporter",
	"Graphics.Pipeline",
	"BenchmarkInstrumentation::DisplayRenderingStats",
	"BenchmarkInstrumentation::ImplThreadRenderingStats",
	"Display::DrawAndSwap",
	"vsync_before",
] as const;

const CATEGORIES = [
	"disabled-by-default-devtools.timeline.frame",
	"benchmark",
	"viz",
	"gpu",
	"cc",
];

type TraceEvent = Readonly<{
	name: string;
	ts: number;
	ph: string;
	cat?: string;
}>;

const fail = (message: string): never => {
	console.error(message);
	process.exit(1);
};

const targets = await (async () => {
	try {
		return (await (
			await fetch(`${origin}/json/list`)
		).json()) as Array<{
			type: string;
			url: string;
			title: string;
			webSocketDebuggerUrl?: string;
		}>;
	} catch (cause) {
		return fail(
			`could not reach CDP at ${origin}.\n` +
				`Launch the game with BITSPLASH_QA=1 so the debugging port is opened.\n${String(cause)}`,
		);
	}
})();

const page = targets.find(
	(t) => t.type === "page" && t.webSocketDebuggerUrl,
);
const debuggerUrl = page?.webSocketDebuggerUrl;
if (!page || !debuggerUrl) {
	fail(
		`no page target at ${origin}. Targets seen: ` +
			targets.map((t) => `${t.type} ${t.url}`).join(", "),
	);
	throw new Error("unreachable");
}

console.log(`attached to ${page.title || page.url}`);

const socket = new WebSocket(debuggerUrl);
const events: TraceEvent[] = [];
let nextId = 1;
const pending = new Map<number, (result: unknown) => void>();

const send = (
	method: string,
	params: object = {},
): Promise<unknown> => {
	const id = nextId++;
	socket.send(JSON.stringify({ id, method, params }));
	return new Promise((resolve) => pending.set(id, resolve));
};

await new Promise<void>((resolve, reject) => {
	socket.addEventListener("open", () => resolve());
	socket.addEventListener("error", () =>
		reject(new Error("CDP socket failed")),
	);
});

socket.addEventListener("message", (message) => {
	const frame = JSON.parse(
		String((message as MessageEvent).data),
	) as {
		id?: number;
		method?: string;
		params?: { value?: TraceEvent[] };
		result?: unknown;
	};
	if (frame.id !== undefined) {
		pending.get(frame.id)?.(frame.result);
		pending.delete(frame.id);
		return;
	}
	if (
		frame.method === "Tracing.dataCollected" &&
		frame.params?.value
	) {
		events.push(...frame.params.value);
	}
});

await send("Tracing.start", {
	transferMode: "ReportEvents",
	traceConfig: { includedCategories: CATEGORIES },
});
console.log(
	`tracing ${seconds}s across ${CATEGORIES.length} categories…`,
);
await new Promise((r) => setTimeout(r, seconds * 1000));

const completed = new Promise<void>((resolve) => {
	const onMessage = (message: Event): void => {
		const frame = JSON.parse(
			String((message as MessageEvent).data),
		) as { method?: string };
		if (frame.method === "Tracing.tracingComplete") {
			socket.removeEventListener("message", onMessage);
			resolve();
		}
	};
	socket.addEventListener("message", onMessage);
});
await send("Tracing.end");
await completed;
socket.close();

console.log(`\ncollected ${events.length} trace events\n`);

const spanOf = (name: string): number => {
	const stamps = events
		.filter((e) => e.name === name)
		.map((e) => e.ts)
		.sort((a, b) => a - b);
	if (stamps.length < 2) {
		return 0;
	}
	return (stamps[stamps.length - 1]! - stamps[0]!) / 1_000_000;
};

console.log(
	`${"candidate event".padEnd(46)}${"count".padStart(8)}${"span s".padStart(9)}${"per s".padStart(9)}`,
);
let found = false;
for (const name of CANDIDATES) {
	const matching = events.filter(
		(e) => e.name === name && e.ph !== "e" && e.ph !== "f",
	);
	if (matching.length === 0) {
		console.log(
			`${name.padEnd(46)}${"0".padStart(8)}${"—".padStart(9)}${"—".padStart(9)}`,
		);
		continue;
	}
	found = true;
	const span = spanOf(name) || seconds;
	console.log(
		name.padEnd(46) +
			String(matching.length).padStart(8) +
			span.toFixed(2).padStart(9) +
			(matching.length / span).toFixed(1).padStart(9),
	);
}

if (!found) {
	console.log(
		`\nNone of the known candidates appeared. Re-run with --raw to see what did;\n` +
			`Chromium may have renamed them again.`,
	);
}

if (has("raw")) {
	const tally = new Map<string, number>();
	for (const event of events) {
		tally.set(event.name, (tally.get(event.name) ?? 0) + 1);
	}
	console.log(`\nall event names by frequency:`);
	for (const [name, count] of [...tally]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 40)) {
		console.log(`  ${String(count).padStart(7)}  ${name}`);
	}
}

console.log(
	`\nRead \`Display::DrawAndSwap\` as presented frames per second — the others are\n` +
		`not presentation (see the header comment). Compare it against\n` +
		`\`probe frametime\`, which reports main-thread rAF cadence: a large gap is the\n` +
		`compositor falling behind, and only the compositor number is what is seen.`,
);

// Top-level await needs this file to be a module.
export {};
