import { Button } from "@base-ui/react/button";
import { Input } from "@base-ui/react/input";
import classNames from "classnames";
import {
	type ComponentProps,
	type FormEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { SaveMetadata } from "../../engine/save/save-driver";
import { GameShell } from "./game-shell";
import styles from "./game-app.module.scss";

type Phase = "menu" | "playing";

const kindLabel = (meta: SaveMetadata): string => {
	if (meta.kind === "manual") {
		return meta.label || "Manual save";
	}
	return meta.kind === "quick" ? "Quicksave" : "Autosave";
};

const formatTime = (savedAt: number): string =>
	new Date(savedAt).toLocaleString();

const GameButton = ({
	variant = "secondary",
	className,
	...props
}: ComponentProps<typeof Button> & {
	variant?: "primary" | "secondary" | "danger";
}) => (
	<Button
		className={classNames(styles.button, styles[variant], className)}
		{...props}
	/>
);

const SaveList = ({
	saves,
	onLoad,
	onDelete,
}: Readonly<{
	saves: ReadonlyArray<SaveMetadata>;
	onLoad: (slot: string) => void;
	onDelete: (slot: string) => void;
}>) => {
	if (saves.length === 0) {
		return <p className={styles.empty}>No saves yet.</p>;
	}
	return (
		<ul className={styles.saveList}>
			{saves.map((meta) => (
				<li key={meta.slot} className={styles.saveRow}>
					<button
						type="button"
						className={styles.saveEntry}
						onClick={() => onLoad(meta.slot)}
					>
						<span className={styles.saveKind}>{kindLabel(meta)}</span>
						<span className={styles.saveTime}>
							{formatTime(meta.savedAt)}
						</span>
					</button>
					<GameButton
						variant="danger"
						onClick={() => onDelete(meta.slot)}
					>
						Delete
					</GameButton>
				</li>
			))}
		</ul>
	);
};

const GameApp = ({ ready }: Readonly<{ ready: Promise<void> }>) => {
	const [shell, setShell] = useState<GameShell | null>(null);
	const [phase, setPhase] = useState<Phase>("menu");
	const [paused, setPaused] = useState(false);
	const [loadOpen, setLoadOpen] = useState(false);
	const [saveNameOpen, setSaveNameOpen] = useState(false);
	const [saveName, setSaveName] = useState("");
	const [saves, setSaves] = useState<ReadonlyArray<SaveMetadata>>([]);
	const [busy, setBusy] = useState(false);
	const detachRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		let cancelled = false;
		void ready.then(() => {
			if (!cancelled) {
				setShell((current) => current ?? new GameShell());
			}
		});
		return () => {
			cancelled = true;
		};
	}, [ready]);

	const refreshSaves = useCallback(async (): Promise<void> => {
		if (!shell) {
			return;
		}
		setSaves(await shell.listSaves());
	}, [shell]);

	useEffect(() => {
		void refreshSaves();
	}, [refreshSaves]);

	const attach = useCallback(
		(node: HTMLDivElement | null): void => {
			if (!shell) {
				return;
			}
			if (node) {
				detachRef.current = shell.viewport.attach(node);
				shell.viewport.element.focus();
			} else {
				detachRef.current?.();
				detachRef.current = null;
			}
		},
		[shell],
	);

	const openPause = useCallback((): void => {
		if (!shell) {
			return;
		}
		shell.setPaused(true);
		setPaused(true);
		setSaveNameOpen(false);
		void refreshSaves();
	}, [shell, refreshSaves]);

	const closePause = useCallback((): void => {
		if (!shell) {
			return;
		}
		shell.setPaused(false);
		setPaused(false);
		setLoadOpen(false);
		setSaveNameOpen(false);
		shell.viewport.element.focus();
	}, [shell]);

	useEffect(() => {
		if (phase !== "playing" || !shell) {
			return;
		}
		const onKey = (event: KeyboardEvent): void => {
			if (event.code === "Escape") {
				event.preventDefault();
				if (paused) {
					closePause();
				} else {
					openPause();
				}
				return;
			}
			if (event.code === "F5") {
				event.preventDefault();
				void shell.quickSave();
				return;
			}
			if (event.code === "F9") {
				event.preventDefault();
				void shell.quickLoad();
			}
		};
		window.addEventListener("keydown", onKey, { capture: true });
		return () => {
			window.removeEventListener("keydown", onKey, { capture: true });
		};
	}, [phase, paused, shell, openPause, closePause]);

	if (!shell) {
		return <div className={styles.loading}>Loading...</div>;
	}

	const newGame = (): void => {
		shell.newGame();
		setPhase("playing");
		setPaused(false);
		setLoadOpen(false);
	};

	const continueLatest = async (): Promise<void> => {
		setBusy(true);
		const ok = await shell.continueLatest();
		setBusy(false);
		if (ok) {
			setPhase("playing");
			setPaused(false);
			setLoadOpen(false);
		}
	};

	const loadSlot = async (slot: string): Promise<void> => {
		setBusy(true);
		const ok = await shell.load(slot);
		setBusy(false);
		if (ok) {
			setPhase("playing");
			setPaused(false);
			setLoadOpen(false);
		}
	};

	const deleteSlot = async (slot: string): Promise<void> => {
		await shell.deleteSave(slot);
		await refreshSaves();
	};

	const submitManualSave = async (
		event: FormEvent<HTMLFormElement>,
	): Promise<void> => {
		event.preventDefault();
		const name = saveName.trim();
		if (name.length === 0) {
			return;
		}
		setBusy(true);
		await shell.manualSave(name);
		setBusy(false);
		setSaveName("");
		setSaveNameOpen(false);
		await refreshSaves();
	};

	const quitToMenu = (): void => {
		shell.quitToMenu();
		setPhase("menu");
		setPaused(false);
		setLoadOpen(false);
		setSaveNameOpen(false);
		void refreshSaves();
	};

	const hasSaves = saves.length > 0;

	return (
		<div className={styles.root}>
			{phase === "playing" && (
				<div className={styles.surface} ref={attach} />
			)}

			{phase === "menu" && (
				<div className={styles.overlay}>
					<div className={styles.panel}>
						<h1 className={styles.title}>Bitsplash</h1>
						{loadOpen ? (
							<>
								<h2 className={styles.subtitle}>Load game</h2>
								<SaveList
									saves={saves}
									onLoad={(slot) => void loadSlot(slot)}
									onDelete={(slot) => void deleteSlot(slot)}
								/>
								<GameButton onClick={() => setLoadOpen(false)}>
									Back
								</GameButton>
							</>
						) : (
							<div className={styles.menu}>
								<GameButton variant="primary" onClick={newGame}>
									New Game
								</GameButton>
								<GameButton
									disabled={!hasSaves || busy}
									onClick={() => void continueLatest()}
								>
									Continue
								</GameButton>
								<GameButton
									disabled={!hasSaves}
									onClick={() => {
										void refreshSaves();
										setLoadOpen(true);
									}}
								>
									Load
								</GameButton>
							</div>
						)}
					</div>
				</div>
			)}

			{phase === "playing" && paused && (
				<div className={styles.overlay}>
					<div className={styles.panel}>
						<h2 className={styles.subtitle}>Paused</h2>
						{loadOpen ? (
							<>
								<SaveList
									saves={saves}
									onLoad={(slot) => void loadSlot(slot)}
									onDelete={(slot) => void deleteSlot(slot)}
								/>
								<GameButton onClick={() => setLoadOpen(false)}>
									Back
								</GameButton>
							</>
						) : saveNameOpen ? (
							<form
								className={styles.menu}
								onSubmit={(event) => void submitManualSave(event)}
							>
								<Input
									className={styles.input}
									placeholder="Save name"
									value={saveName}
									autoFocus
									onChange={(event) =>
										setSaveName(event.target.value)
									}
								/>
								<div className={styles.row}>
									<GameButton
										type="button"
										variant="secondary"
										onClick={() => setSaveNameOpen(false)}
									>
										Cancel
									</GameButton>
									<GameButton
										variant="primary"
										type="submit"
										disabled={busy || saveName.trim().length === 0}
									>
										Save
									</GameButton>
								</div>
							</form>
						) : (
							<div className={styles.menu}>
								<GameButton variant="primary" onClick={closePause}>
									Resume
								</GameButton>
								<GameButton
									disabled={!shell.canSave()}
									onClick={() => setSaveNameOpen(true)}
								>
									Save
								</GameButton>
								<GameButton
									onClick={() => {
										void refreshSaves();
										setLoadOpen(true);
									}}
								>
									Load
								</GameButton>
								<GameButton variant="danger" onClick={quitToMenu}>
									Quit to menu
								</GameButton>
							</div>
						)}
						<p className={styles.hint}>
							Esc pause · F5 quicksave · F9 quickload
						</p>
					</div>
				</div>
			)}
		</div>
	);
};

export { GameApp };
