import { median } from './color';

export class CameraSession {
  #stream: MediaStream | null = null;
  #generation = 0;

  async start(video: HTMLVideoElement): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.isSecureContext) {
      throw new Error('当前环境无法使用相机，请改用手动录入。');
    }
    this.stop();
    const generation = this.#generation;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    if (generation !== this.#generation) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('相机请求已取消。');
    }
    this.#stream = stream;
    video.srcObject = stream;
    await video.play();
  }

  async capture(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
  ): Promise<Array<[number, number, number]>> {
    if (!this.#stream || !video.videoWidth || !video.videoHeight)
      throw new Error('相机画面尚未准备好。');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('浏览器无法读取相机画面。');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const samples = Array.from({ length: 9 }, () => [[], [], []] as [number[], number[], number[]]);
    const generation = this.#generation;

    for (let frame = 0; frame < 7; frame += 1) {
      if (!this.#stream || generation !== this.#generation) throw new Error('相机采集已取消。');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const square = Math.min(canvas.width, canvas.height) * 0.62;
      const originX = (canvas.width - square) / 2;
      const originY = (canvas.height - square) / 2;
      const cell = square / 3;
      for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 3; column += 1) {
          const sampleSize = Math.max(8, Math.floor(cell * 0.24));
          const x = Math.floor(originX + column * cell + (cell - sampleSize) / 2);
          const y = Math.floor(originY + row * cell + (cell - sampleSize) / 2);
          const data = context.getImageData(x, y, sampleSize, sampleSize).data;
          const target = samples[row * 3 + column]!;
          for (let pixel = 0; pixel < data.length; pixel += 16) {
            target[0].push(data[pixel]!);
            target[1].push(data[pixel + 1]!);
            target[2].push(data[pixel + 2]!);
          }
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    }

    return samples.map(([red, green, blue]) => [median(red), median(green), median(blue)]);
  }

  stop(): void {
    this.#generation += 1;
    this.#stream?.getTracks().forEach((track) => track.stop());
    this.#stream = null;
  }
}
