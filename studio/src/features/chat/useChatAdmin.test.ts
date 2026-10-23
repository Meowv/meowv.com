import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatApiError } from './chat-api';
import type { ChatMessage } from './chat-types';

const mocks = vi.hoisted(() => ({ request: vi.fn(), unmount: [] as Array<() => void> }));
vi.mock('vue', async (original) => ({
  ...(await original<typeof import('vue')>()),
  onBeforeUnmount: (callback: () => void) => mocks.unmount.push(callback),
}));
vi.mock('./chat-api', async (original) => ({
  ...(await original<typeof import('./chat-api')>()),
  chatRequest: mocks.request,
}));
import { useChatAdmin } from './useChatAdmin';
const key = 'YOUR_SYNTHETIC_FRONTEND_MANAGEMENT_TOKEN';
const message: ChatMessage = {
  id: '9007199254740993',
  clientMessageId: 'client-id',
  guestId: 'guest-id',
  nickname: '访客',
  avatarSeed: 'seed',
  content: 'test message',
  createdAt: '2026-10-23T00:00:00Z',
  deleted: false,
  revision: 0,
  reply: null,
  mentions: [],
};
beforeEach(() => {
  mocks.request.mockReset();
  mocks.unmount.length = 0;
});
describe('Chat page management', () => {
  it('does not expose actions until verification succeeds and sends credentials only in headers', async () => {
    const admin = useChatAdmin();
    expect(await admin.removeMessage(message)).toBe(false);
    expect(mocks.request).not.toHaveBeenCalled();
    mocks.request.mockRejectedValueOnce(
      new ChatApiError(401, 'access_code_unauthorized', 'invalid'),
    );
    expect(await admin.verify(key)).toBe(false);
    expect(admin.active.value).toBe(false);
    mocks.request.mockResolvedValue(undefined);
    expect(await admin.verify(key)).toBe(true);
    expect(admin.active.value).toBe(true);
    expect(mocks.request.mock.calls[1]![0]).toBe('/admin/session');
    expect(await admin.removeMessage(message)).toBe(true);
    const [path, , options] = mocks.request.mock.calls[2]!;
    expect(path).toContain('/admin/messages/9007199254740993?');
    expect(path).not.toContain(key);
    expect(path).toContain('permanent=false');
    await admin.removeMessage(message, true);
    expect(mocks.request.mock.calls[3]![0]).toContain('permanent=true');
    expect(options).toMatchObject({
      method: 'DELETE',
      headers: { Authorization: `Bearer ${key}` },
    });
  });
  it('restores marked messages using the access code and clears rejected authorization', async () => {
    const admin = useChatAdmin();
    mocks.request
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ ...message, revision: 2 });
    await admin.verify(key);
    expect(await admin.restoreMessage(message)).toMatchObject({
      revision: 2,
      content: 'test message',
    });
    expect(mocks.request.mock.calls[1]![0]).toBe('/admin/messages/9007199254740993/restore');
    expect(mocks.request.mock.calls[1]![2]).toMatchObject({
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
    });
    mocks.request.mockRejectedValueOnce(
      new ChatApiError(401, 'access_code_unauthorized', 'invalid'),
    );
    expect(await admin.restoreMessage(message)).toBeNull();
    expect(admin.active.value).toBe(false);
  });
  it('clears management state after server rejection and prevents further actions', async () => {
    mocks.request
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ChatApiError(401, 'access_code_unauthorized', 'invalid'));
    const admin = useChatAdmin();
    await admin.verify(key);
    expect(await admin.removeMessage(message)).toBe(false);
    expect(admin.active.value).toBe(false);
    expect(admin.busy.value).toBe(false);
    expect(await admin.removeMessage(message)).toBe(false);
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
  it('cancels verification when dismissed or unmounted and ignores late success', async () => {
    let resolve!: () => void;
    mocks.request.mockReturnValueOnce(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    const admin = useChatAdmin();
    const attempt = admin.verify(key);
    const signal = mocks.request.mock.calls[0]![1] as AbortSignal;
    mocks.unmount.forEach((callback) => callback());
    expect(signal.aborted).toBe(true);
    resolve();
    expect(await attempt).toBe(false);
    expect(admin.active.value).toBe(false);
  });
});
