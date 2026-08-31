import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraSession } from '../scanner/camera-session';

function createVideo(): HTMLVideoElement {
  return {
    autoplay: false,
    muted: false,
    playsInline: false,
    readyState: 1,
    srcObject: null,
    play: vi.fn().mockResolvedValue(undefined),
  } as unknown as HTMLVideoElement;
}

function createStream() {
  const stop = vi.fn();
  return {
    stream: { getTracks: () => [{ stop }] } as unknown as MediaStream,
    stop,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CameraSession', () => {
  it('以优先约束打开相机并等待预览可用', async () => {
    const { stream } = createStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const video = createVideo();

    await new CameraSession().start(video);

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    expect(video.srcObject).toBe(stream);
    expect(video.autoplay).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
  });

  it('优先约束不被设备支持时降级为默认摄像头', async () => {
    const { stream } = createStream();
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('不支持', 'OverconstrainedError'))
      .mockResolvedValueOnce(stream);
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await new CameraSession().start(createVideo());

    expect(getUserMedia).toHaveBeenLastCalledWith({ audio: false, video: true });
  });
});
