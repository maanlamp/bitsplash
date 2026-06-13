const writeString = (
	view: DataView,
	offset: number,
	text: string,
): void => {
	for (let i = 0; i < text.length; i++) {
		view.setUint8(offset + i, text.charCodeAt(i));
	}
};

export const encodeWav = (buffer: AudioBuffer): ArrayBuffer => {
	const channels = buffer.numberOfChannels;
	const sampleRate = buffer.sampleRate;
	const length = buffer.length;
	const blockAlign = channels * 2;
	const dataSize = length * blockAlign;
	const out = new ArrayBuffer(44 + dataSize);
	const view = new DataView(out);

	writeString(view, 0, "RIFF");
	view.setUint32(4, 36 + dataSize, true);
	writeString(view, 8, "WAVE");
	writeString(view, 12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, 16, true);
	writeString(view, 36, "data");
	view.setUint32(40, dataSize, true);

	const data: Float32Array[] = [];
	for (let c = 0; c < channels; c++) {
		data.push(buffer.getChannelData(c));
	}

	let offset = 44;
	for (let i = 0; i < length; i++) {
		for (let c = 0; c < channels; c++) {
			const sample = Math.max(-1, Math.min(1, data[c]![i]!));
			view.setInt16(
				offset,
				sample < 0 ? sample * 0x8000 : sample * 0x7fff,
				true,
			);
			offset += 2;
		}
	}

	return out;
};
