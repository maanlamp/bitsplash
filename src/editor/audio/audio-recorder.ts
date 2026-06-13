const MIME_CANDIDATES = [
	"audio/webm;codecs=opus",
	"audio/webm",
	"audio/ogg;codecs=opus",
	"audio/mp4",
];

const pickMime = (): string | undefined =>
	MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime));

export class AudioRecorder {
	private recorder: MediaRecorder | null = null;
	private stream: MediaStream | null = null;
	private chunks: Blob[] = [];

	get recording(): boolean {
		return this.recorder !== null;
	}

	async start(): Promise<void> {
		this.stream = await navigator.mediaDevices.getUserMedia({
			audio: true,
		});
		const mime = pickMime();
		this.chunks = [];
		this.recorder = new MediaRecorder(
			this.stream,
			mime ? { mimeType: mime } : undefined,
		);
		this.recorder.ondataavailable = (event) => {
			if (event.data.size > 0) {
				this.chunks.push(event.data);
			}
		};
		this.recorder.start();
	}

	stop(): Promise<Blob> {
		return new Promise((resolve, reject) => {
			const recorder = this.recorder;
			if (!recorder) {
				reject(new Error("Not recording."));
				return;
			}
			recorder.onstop = () => {
				const blob = new Blob(this.chunks, {
					type: recorder.mimeType,
				});
				this.stream?.getTracks().forEach((track) => track.stop());
				this.recorder = null;
				this.stream = null;
				resolve(blob);
			};
			recorder.stop();
		});
	}
}
