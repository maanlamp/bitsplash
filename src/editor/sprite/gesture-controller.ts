import type { SpriteToolId } from "./sprite-tool-id";
import type {
	SpriteTool,
	ToolContext,
	ToolSession,
} from "./tool-strategy";

/**
 * The gesture the controller is in. Either nothing is happening (`idle`) or a
 * single stroke is live, owned by exactly one tool, one pointer, and one
 * session. There is no third state and no free-floating flag — the union is the
 * whole truth, so the classic desyncs (a `painting` boolean stuck true with no
 * buffer, a session belonging to a tool that is no longer active, a stroke
 * outliving the temporary tool that started it) are unrepresentable.
 */
type GestureState =
	| { readonly kind: "idle" }
	| {
			readonly kind: "stroking";
			readonly tool: SpriteTool;
			readonly pointerId: number;
			readonly session: ToolSession;
	  };

/**
 * The single owner of "is a stroke in progress, and on which tool/pointer".
 *
 * A stroke is driven end-to-end by the tool that started it: {@link move} and
 * {@link up} dispatch to the **owning** tool regardless of which tool is active
 * now, so a tool switch mid-drag cannot hand a half-finished stroke to a
 * different tool. Every exit — {@link up}, {@link cancel}, a tool change
 * ({@link syncTool}), pointer cancel, or lost pointer capture — routes through
 * the tool's own `onUp`/`onCancel` and lands back in `idle`, so the document's
 * stroke buffer is always either committed or discarded, never stranded.
 *
 * Illegal states made unrepresentable:
 * - "painting with no session" — `stroking` always carries a session.
 * - "a temp tool popped while its stroke is still live" — {@link syncTool}
 *   cancels the owning stroke before the tool identity changes.
 * - "a stroke committed by a different tool than started it" — dispatch always
 *   targets the stored owner.
 */
export class GestureController {
	private state: GestureState = { kind: "idle" };

	/** Whether a stroke is currently live. */
	get active(): boolean {
		return this.state.kind === "stroking";
	}

	/** The id of the tool that owns the live stroke, or `null` when idle. */
	get ownerToolId(): SpriteToolId | null {
		return this.state.kind === "stroking" ? this.state.tool.id : null;
	}

	/**
	 * Begin a gesture with `tool`. A stroke already live is cancelled first
	 * (defensive; the panel cancels on tool change before this runs). The
	 * gesture becomes live only if `onDown` actually opened one — either a
	 * document stroke buffer (`doc.strokeActive`) or a non-pixel gesture that set
	 * `session.active` (e.g. the attachment handle drag). A press off-image or
	 * with a non-primary button leaves the controller idle.
	 */
	down(tool: SpriteTool, ctx: ToolContext): void {
		if (this.state.kind === "stroking") {
			this.cancel(ctx);
		}
		const session: ToolSession = {
			snapshot: null,
			last: null,
			active: false,
			attachment: null,
			pp: null,
			stab: null,
			shape: null,
			selectionDrag: null,
			custom: null,
			transformDrag: null,
		};
		tool.onDown?.(ctx, session);
		if (ctx.doc.strokeActive || session.active) {
			this.state = {
				kind: "stroking",
				tool,
				pointerId: ctx.pointerId,
				session,
			};
		}
	}

	/** Continue the live stroke. Ignored unless the owning pointer moved. */
	move(ctx: ToolContext): void {
		if (
			this.state.kind !== "stroking" ||
			ctx.pointerId !== this.state.pointerId
		) {
			return;
		}
		this.state.tool.onMove?.(ctx, this.state.session);
	}

	/** Commit the live stroke. Ignored unless raised by the owning pointer. */
	up(ctx: ToolContext): void {
		if (
			this.state.kind !== "stroking" ||
			ctx.pointerId !== this.state.pointerId
		) {
			return;
		}
		const { tool, session } = this.state;
		this.state = { kind: "idle" };
		tool.onUp?.(ctx, session);
	}

	/**
	 * Abort the live stroke (pointer cancel, capture loss, tool change, or panel
	 * teardown), discarding its buffer. Inert when idle. Does not key on the
	 * pointer id — the caller may not have an originating event.
	 */
	cancel(ctx: ToolContext): void {
		if (this.state.kind !== "stroking") {
			return;
		}
		const { tool, session } = this.state;
		this.state = { kind: "idle" };
		tool.onCancel?.(ctx, session);
	}

	/**
	 * React to the active tool changing. If a stroke is live and owned by a tool
	 * other than `activeToolId` — a switch or a hold-key push/pop mid-stroke —
	 * cancel it so no stroke ever outlives its owner.
	 */
	syncTool(activeToolId: SpriteToolId, ctx: ToolContext): void {
		if (
			this.state.kind === "stroking" &&
			this.state.tool.id !== activeToolId
		) {
			this.cancel(ctx);
		}
	}
}
