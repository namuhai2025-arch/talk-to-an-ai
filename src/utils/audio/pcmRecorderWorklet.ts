export const WORKLET_NAME = "pcm-recorder-processor";

const workletCode = `
class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Int16Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const channelData = input[0];
    for (let i = 0; i < channelData.length; i++) {
      // Clamp between -1.0 and 1.0
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      // Convert Float32 [-1.0, 1.0] to Signed 16-bit PCM [-32768, 32767]
      this.buffer[this.bufferIndex++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;

      if (this.bufferIndex >= this.bufferSize) {
        this.port.postMessage(this.buffer.slice(0, this.bufferSize).buffer, [
          this.buffer.slice(0, this.bufferSize).buffer
        ]);
        this.bufferIndex = 0;
      }
    }
    return true;
  }
}

registerProcessor("${WORKLET_NAME}", PCMRecorderProcessor);
`;

export function getAudioWorkletBlobUrl(): string {
  const blob = new Blob([workletCode], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}