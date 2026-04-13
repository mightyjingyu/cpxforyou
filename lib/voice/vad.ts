/**
 * 마이크 스트림에서 에너지 기반으로 발화 종료(무음 구간)를 감지한다.
 * MediaRecorder와 동시에 같은 MediaStream을 사용해도 된다.
 */
export type VadController = { stop: () => void };

export function startSpeechEndVad(
  mediaStream: MediaStream,
  onSpeechEnd: () => void,
  opts?: {
    silenceMs?: number;
    minSpeechMs?: number;
    volumeThreshold?: number;
  }
): VadController {
  const silenceMs = opts?.silenceMs ?? 480;
  const minSpeechMs = opts?.minSpeechMs ?? 320;
  const volumeThreshold = opts?.volumeThreshold ?? 9;

  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(mediaStream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const data = new Uint8Array(analyser.fftSize);
  let speechEver = false;
  let speechStartAt = 0;
  let lastLoudAt = 0;
  let raf = 0;
  let ended = false;

  const tick = () => {
    if (ended) return;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += Math.abs(data[i] - 128);
    }
    const level = sum / data.length;
    const now = performance.now();
    const loud = level > volumeThreshold;

    if (loud) {
      if (!speechEver) {
        speechEver = true;
        speechStartAt = now;
      }
      lastLoudAt = now;
    } else if (speechEver && now - lastLoudAt >= silenceMs) {
      const spokeLongEnough = now - speechStartAt >= minSpeechMs;
      if (spokeLongEnough) {
        ended = true;
        cancelAnimationFrame(raf);
        void audioContext.close();
        onSpeechEnd();
        return;
      }
    }

    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);

  return {
    stop: () => {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(raf);
      void audioContext.close();
    },
  };
}
