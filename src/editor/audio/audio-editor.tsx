import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import {
	ArrowUUpLeftIcon,
	ArrowUUpRightIcon,
	CursorIcon,
	MicrophoneIcon,
	PlayIcon,
	ScissorsIcon,
	StopIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import type AudioManager from "../../engine/audio/audio";
import type { PlaybackHandle } from "../../engine/audio/audio";
import Button from "../button";
import FloatingToolbar from "../floating-toolbar";
import Tooltip, { TooltipProvider } from "../tooltip";
import controls from "../styles/controls.module.scss";
import styles from "./audio-editor.module.scss";
import { assetFilename } from "../assets";
import Timeline from "../timeline/timeline";
import type {
	ClipChange,
	ClipChangeMode,
	TimelineTrack,
} from "../timeline/timeline-types";
import { useDocumentEditor } from "../use-document-editor";
import { useEditorValue } from "../use-editor";
import { AudioDocument } from "./audio-document";
import {
	type AudioTool,
	AudioEditorState,
} from "./audio-editor-state";
import { AudioRecorder } from "./audio-recorder";
import ClipWaveform from "./clip-waveform";

const AUDIO_COLOR = "oklch(0.64 0.12 200)";
const DEFAULT_TRACK_HEIGHT = 64;

const ensureWavExt = (name: string): string =>
	`${name.replace(/\.[^./\\]+$/, "")}.wav`;

const AudioEditor = ({
	assetUrl,
	onDirty,
	audio,
	onCreated,
	active,
}: Readonly<{
	assetUrl: string | null;
	onDirty: (dirty: boolean) => void;
	audio: AudioManager;
	onCreated: (url: string) => void;
	active: boolean;
}>) => {
	const [state] = useState(() => new AudioEditorState());
	const [recorder] = useState(() => new AudioRecorder());
	const [, setTick] = useState(0);
	const [playhead, setPlayhead] = useState(0);
	const [isPlaying, setIsPlaying] = useState(false);
	const [isRecording, setIsRecording] = useState(false);
	const [trackHeight, setTrackHeight] = useState(
		DEFAULT_TRACK_HEIGHT,
	);
	const handleRef = useRef<PlaybackHandle | null>(null);
	const rafRef = useRef(0);

	const tool = useEditorValue(state, (s) => s.tool);
	const selectedClipId = useEditorValue(
		state,
		(s) => s.selectedClipId,
	);

	const { doc, history, undoable } = useDocumentEditor({
		deps: [assetUrl, audio],
		load: () =>
			assetUrl === null
				? AudioDocument.empty(audio.sampleRate)
				: AudioDocument.load(assetUrl, audio),
		onDirty,
		active,
		onReset: () => {
			state.reset();
			setPlayhead(0);
		},
		onChange: () => setTick((t) => t + 1),
	});

	const stopPlayback = (): void => {
		handleRef.current?.stop();
		handleRef.current = null;
		cancelAnimationFrame(rafRef.current);
		setIsPlaying(false);
	};

	useEffect(
		() => () => {
			handleRef.current?.stop();
			cancelAnimationFrame(rafRef.current);
		},
		[],
	);

	const withHistory = (op: () => void): void => {
		if (!doc) {
			return;
		}
		const prev = doc.snapshot();
		op();
		const next = doc.snapshot();
		history.push({
			undo: () => doc.restore(prev),
			redo: () => doc.restore(next),
		});
	};

	const play = (): void => {
		if (!doc || doc.empty) {
			return;
		}
		const startAt = playhead >= doc.duration ? 0 : playhead;
		const handle = audio.playBuffer(doc.renderArrangement(), {
			offset: startAt,
			onEnded: () => {
				stopPlayback();
				setPlayhead(doc.duration);
			},
		});
		handleRef.current = handle;
		setIsPlaying(true);
		const tick = () => {
			setPlayhead(handle.position());
			rafRef.current = requestAnimationFrame(tick);
		};
		rafRef.current = requestAnimationFrame(tick);
	};

	const togglePlay = (): void => {
		if (isPlaying) {
			stopPlayback();
		} else {
			play();
		}
	};

	const toggleRecord = async (): Promise<void> => {
		if (isRecording) {
			try {
				const blob = await recorder.stop();
				const buffer = await audio.decode(await blob.arrayBuffer());
				if (doc) {
					withHistory(() => doc.setSource(buffer));
				}
			} catch (error) {
				window.alert(`Recording failed: ${String(error)}`);
			} finally {
				setIsRecording(false);
			}
		} else {
			try {
				if (isPlaying) {
					stopPlayback();
				}
				await recorder.start();
				setIsRecording(true);
			} catch (error) {
				window.alert(`Microphone unavailable: ${String(error)}`);
			}
		}
	};

	const deleteSelected = (): void => {
		if (!doc || !state.selectedClipId) {
			return;
		}
		const id = state.selectedClipId;
		withHistory(() => doc.removeClip(id));
		state.setSelectedClip(null);
	};

	const onClipPress = (
		_trackId: string,
		clipId: string,
		unit: number,
	): void => {
		if (!doc) {
			return;
		}
		if (state.tool === "razor") {
			withHistory(() => doc.splitAt(unit));
		} else {
			state.setSelectedClip(clipId);
		}
	};

	const onClipChange = (
		_trackId: string,
		clipId: string,
		change: ClipChange,
		mode: ClipChangeMode,
	): void => {
		if (!doc) {
			return;
		}
		withHistory(() => {
			if (mode === "move") {
				doc.moveClip(clipId, change.start);
			} else if (mode === "trim-start") {
				doc.trimStart(clipId, change.start);
			} else {
				doc.trimEnd(clipId, change.duration);
			}
		});
	};

	const save = async (): Promise<void> => {
		if (!doc) {
			return;
		}
		const blob = doc.toBlob();
		if (assetUrl === null) {
			const input = window.prompt("File name", "recording.wav");
			if (!input) {
				return;
			}
			const name = ensureWavExt(input);
			const response = await fetch("/__upload-asset", {
				method: "POST",
				headers: { "x-filename": name, "x-overwrite": "false" },
				body: blob,
			});
			if (response.status === 304) {
				window.alert(`"${name}" already exists.`);
				return;
			}
			const data = (await response.json()) as { url: string };
			doc.markSaved();
			onCreated(data.url);
		} else {
			await fetch("/__upload-asset", {
				method: "POST",
				headers: {
					"x-filename": assetFilename(assetUrl),
					"x-overwrite": "true",
				},
				body: blob,
			});
			doc.markSaved();
		}
	};

	useHotkeys(
		"mod+s",
		(e) => {
			e.preventDefault();
			void save();
		},
		{ preventDefault: true, enabled: active },
		[active, doc, assetUrl],
	);
	useHotkeys(
		"space",
		(e) => {
			e.preventDefault();
			togglePlay();
		},
		{ preventDefault: true, enabled: active },
		[isPlaying, doc, playhead, active],
	);
	useHotkeys(
		"v",
		() => state.setTool("select"),
		{
			enabled: active,
		},
		[state, active],
	);
	useHotkeys(
		"r",
		() => state.setTool("razor"),
		{
			enabled: active,
		},
		[state, active],
	);
	useHotkeys(
		"delete,backspace",
		() => deleteSelected(),
		{
			enabled: active,
		},
		[doc, active],
	);

	const name =
		assetUrl === null ? "untitled" : assetFilename(assetUrl);

	const tracks: ReadonlyArray<TimelineTrack> = doc
		? [
				{
					id: "audio",
					name,
					height: trackHeight,
					color: AUDIO_COLOR,
					clips: doc.clips.map((clip) => ({
						id: clip.id,
						start: clip.start,
						duration: clip.duration,
					})),
				},
			]
		: [];

	return (
		<div className={styles.audioEditor}>
			<TooltipProvider>
				<div className={styles.audioBody}>
					<FloatingToolbar>
						<Tooltip label="Undo">
							<Button
								variant="icon"
								onClick={() => history.undo()}
								disabled={!undoable.canUndo}
							>
								<ArrowUUpLeftIcon />
							</Button>
						</Tooltip>
						<Tooltip label="Redo">
							<Button
								variant="icon"
								onClick={() => history.redo()}
								disabled={!undoable.canRedo}
							>
								<ArrowUUpRightIcon />
							</Button>
						</Tooltip>
						<div className={controls.toolbarSeparator} />
						<ToggleGroup
							value={[tool]}
							onValueChange={(value) => {
								if (value.length > 0) {
									state.setTool(value[0] as AudioTool);
								}
							}}
							className={controls.toggleGroup}
						>
							<Tooltip label="Select">
								<Toggle
									value="select"
									className={controls.iconButton}
								>
									<CursorIcon
										weight={tool === "select" ? "fill" : undefined}
									/>
								</Toggle>
							</Tooltip>
							<Tooltip label="Split">
								<Toggle value="razor" className={controls.iconButton}>
									<ScissorsIcon
										weight={tool === "razor" ? "fill" : undefined}
									/>
								</Toggle>
							</Tooltip>
						</ToggleGroup>
						<Tooltip label="Delete clip">
							<Button
								variant="icon"
								onClick={deleteSelected}
								disabled={!selectedClipId}
							>
								<TrashIcon />
							</Button>
						</Tooltip>
						<div className={controls.toolbarSeparator} />
						<Tooltip label={isPlaying ? "Stop" : "Play"}>
							<Button
								variant="icon"
								onClick={togglePlay}
								disabled={!doc || doc.empty}
							>
								{isPlaying ? <StopIcon /> : <PlayIcon />}
							</Button>
						</Tooltip>
						<Tooltip
							label={isRecording ? "Stop recording" : "Record"}
						>
							<Button
								variant="icon"
								className={
									isRecording ? controls.recordActive : undefined
								}
								onClick={() => void toggleRecord()}
							>
								<MicrophoneIcon />
							</Button>
						</Tooltip>
					</FloatingToolbar>
					{doc ? (
						<Timeline
							key={doc.empty ? "empty" : "content"}
							tracks={tracks}
							duration={doc.duration}
							playhead={playhead}
							selectedClipId={selectedClipId}
							clipsDraggable={tool === "select"}
							onSeek={(t) => {
								if (isPlaying) {
									stopPlayback();
								}
								setPlayhead(t);
							}}
							onClipPress={onClipPress}
							onClipChange={onClipChange}
							onTrackResize={(_id, h) => setTrackHeight(h)}
							renderClip={(_track, clip) => {
								const audioClip = doc.clips.find(
									(c) => c.id === clip.id,
								);
								return audioClip ? (
									<ClipWaveform
										doc={doc}
										clip={audioClip}
										color={AUDIO_COLOR}
									/>
								) : null;
							}}
						/>
					) : (
						<div className={controls.loading}>Loading…</div>
					)}
				</div>
			</TooltipProvider>
		</div>
	);
};

export default AudioEditor;
