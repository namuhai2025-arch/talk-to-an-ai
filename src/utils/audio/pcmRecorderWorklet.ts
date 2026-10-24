export const WORKLET_NAME = "pcm-recorder-processor";

const workletCode = `
class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 1024 samples at 16kHz = 64ms packet cadence (standard for Gemini Live)
    this.bufferSize = 1024;
    this.outputBuffer = new Int16Array(this.bufferSize);
    this.outputIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const channelData = input[0];
    const len = channelData.length;

    for (let i = 0; i < len; i++) {
      // Clamp between -1.0 and 1.0
      const sample = Math.max(-1.0, Math.min(1.0, channelData[i]));
      
      // Convert Float32 [-1.0, 1.0] to Linear 16-bit PCM [-32768, 32767]
      this.outputBuffer[this.outputIndex++] =
        sample < 0 ? sample * 0x8000 : sample * 0x7fff;

      // When 64ms chunk is filled, send to main thread
      if (this.outputIndex >= this.bufferSize) {
        const chunkToSend = this.outputBuffer.slice(0, this.bufferSize);
        this.port.postMessage(chunkToSend.buffer, [chunkToSend.buffer]);
        this.outputIndex = 0;
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