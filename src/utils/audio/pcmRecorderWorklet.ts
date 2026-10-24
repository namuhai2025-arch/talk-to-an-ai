export const WORKLET_NAME = "pcm-recorder-processor";

const workletCode = `
class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    // 1024 samples at 16kHz = 64ms packet cadence (optimal for Gemini Live latency)
    this.bufferSize = 1024;
    this.outputBuffer = new Int16Array(this.bufferSize);
    this.outputIndex = 0;
    
    // Global sampleRate provides the hardware context's actual sample rate
    this.sourceSampleRate = sampleRate;
    this.ratio = this.sourceSampleRate / this.targetSampleRate;
    this.resampleFraction = 0;
    this.previousInputSample = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const inputChannel = input[0];
    const inputLength = inputChannel.length;
    if (inputLength === 0) {
      return true;
    }

    let inputIndex = 0;
    while (inputIndex < inputLength) {
      if (this.resampleFraction >= 1.0) {
        this.previousInputSample = inputChannel[inputIndex];
        inputIndex++;
        this.resampleFraction -= 1.0;
      } else {
        const currentInputSample = inputChannel[inputIndex];
        // Linear interpolation between consecutive samples
        const interpolated =
          this.previousInputSample +
          (currentInputSample - this.previousInputSample) * this.resampleFraction;

        // Clamp between -1.0 and 1.0
        const clamped = Math.max(-1.0, Math.min(1.0, interpolated));
        
        // Convert Float32 [-1.0, 1.0] to Signed 16-bit PCM [-32768, 32767]
        this.outputBuffer[this.outputIndex++] =
          clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

        if (this.outputIndex >= this.bufferSize) {
          const chunkToSend = this.outputBuffer.slice(0, this.bufferSize);
          this.port.postMessage(chunkToSend.buffer, [chunkToSend.buffer]);
          this.outputIndex = 0;
        }

        this.resampleFraction += this.ratio;
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