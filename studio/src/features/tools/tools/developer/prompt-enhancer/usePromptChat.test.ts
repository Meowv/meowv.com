import { describe, expect, it, vi } from 'vitest';
import { createPromptChat } from './usePromptChat';
import { ModelError } from './api';
import {
  conversationTitle,
  modelHistory,
  newId,
  type Conversation,
  type Message,
  type ModelConfig,
} from './types';
import type { ChatRepository } from './storage';

const config: ModelConfig = {
  protocol: 'openai',
  baseUrl: 'https://model.example.test',
  apiKey: 'TEST_KEY_NOT_REAL',
  model: 'test-model',
};

function memoryRepository(): ChatRepository {
  const conversations = new Map<string, Conversation>();
  const messages = new Map<string, Message>();
  return {
    list: async () =>
      [...conversations.values()]
        .map((row) => ({ ...row }))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    messages: async (id) =>
      [...messages.values()].filter((row) => row.conversationId === id).map((row) => ({ ...row })),
    create: async (row) => {
      conversations.set(row.id, { ...row });
    },
    saveDraft: async (id, draft) => {
      const row = conversations.get(id);
      if (row) conversations.set(id, { ...row, draft });
    },
    prepare: async (id, content, retryId) => {
      const row = conversations.get(id)!;
      const previous = retryId ? messages.get(retryId) : null;
      const message: Message = previous
        ? { ...previous, status: 'pending', error: undefined }
        : {
            id: newId(),
            conversationId: id,
            role: 'user',
            content,
            status: 'pending',
            createdAt: Date.now(),
          };
      messages.set(message.id, message);
      conversations.set(id, {
        ...row,
        title: row.title === '新对话' ? conversationTitle(content) : row.title,
        draft: retryId ? row.draft : '',
        updatedAt: Date.now(),
      });
      return message;
    },
    finish: async (message, status, output, error) => {
      const row = messages.get(message.id);
      if (!row || !conversations.has(message.conversationId) || row.status !== 'pending')
        return false;
      messages.set(message.id, { ...row, status, error });
      if (output !== undefined) {
        const id = newId();
        messages.set(id, {
          id,
          conversationId: message.conversationId,
          role: 'assistant',
          content: output,
          createdAt: Date.now(),
          status: 'complete',
        });
      }
      return true;
    },
    remove: async (id) => {
      conversations.delete(id);
      for (const row of messages.values()) if (row.conversationId === id) messages.delete(row.id);
    },
    recover: async () => {
      for (const row of messages.values())
        if (row.status === 'pending') messages.set(row.id, { ...row, status: 'interrupted' });
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function fixture(request = vi.fn().mockResolvedValue('增强结果')) {
  const repository = memoryRepository();
  const chat = createPromptChat(repository, request);
  await chat.initialize();
  await chat.create();
  return { chat, repository, request };
}

describe('提示词会话与请求生命周期', () => {
  it('初始化期间离开页面，不会继续创建空白会话', async () => {
    const repository = memoryRepository();
    const pending = deferred<void>();
    repository.recover = () => pending.promise;
    const chat = createPromptChat(repository);
    const opening = chat.initialize();
    chat.dispose();
    pending.resolve();
    await opening;
    await chat.create();
    expect(chat.ready.value).toBe(false);
    expect(await repository.list()).toHaveLength(0);
  });
  it('标题按 Unicode 字符取前 24 字', () => {
    expect(conversationTitle(' 你好\n 世界 ')).toBe('你好 世界');
    expect(conversationTitle('🐱'.repeat(25))).toBe('🐱'.repeat(24));
  });

  it('新建、发送及恢复历史和草稿', async () => {
    const { chat, repository } = await fixture();
    chat.setDraft('需求');
    await chat.send(config);
    expect(chat.messages.value.map((row) => row.content)).toEqual(['需求', '增强结果']);
    chat.setDraft('下次继续');
    await vi.waitFor(async () => expect((await repository.list())[0]!.draft).toBe('下次继续'));
    chat.dispose();
    const reopened = createPromptChat(repository);
    await reopened.initialize();
    expect(reopened.messages.value).toHaveLength(2);
    expect(reopened.draft.value).toBe('下次继续');
  });

  it('未写入用户消息时不发送网络请求，输入保持原样', async () => {
    const { chat, repository, request } = await fixture();
    repository.prepare = async () => {
      throw Error('quota');
    };
    chat.setDraft('不能丢失');
    await chat.send(config);
    expect(request).not.toHaveBeenCalled();
    expect(chat.draft.value).toBe('不能丢失');
    expect(chat.error.value).toContain('尚未发送');
  });

  it('失败后手动重试不重复追加用户消息', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new ModelError('额度不足'))
      .mockResolvedValueOnce('成功');
    const { chat } = await fixture(request);
    chat.setDraft('原稿');
    await chat.send(config);
    expect(chat.messages.value[0]!.status).toBe('failed');
    const id = chat.messages.value[0]!.id;
    await chat.send(config, id);
    expect(chat.messages.value.map((row) => row.content)).toEqual(['原稿', '成功']);
    expect(chat.messages.value[0]!.id).toBe(id);
  });

  it('多轮请求携带完整有效历史', async () => {
    const { chat, request } = await fixture();
    chat.setDraft('原始需求');
    await chat.send(config);
    chat.setDraft('再短一点');
    await chat.send(config);
    expect(request.mock.calls[1]![1]).toEqual([
      { role: 'user', content: '原始需求' },
      { role: 'assistant', content: '增强结果' },
      { role: 'user', content: '再短一点' },
    ]);
  });

  it('失败消息不进入下一轮有效上下文', () => {
    const rows: Message[] = [
      {
        id: 'failed',
        conversationId: 'chat',
        role: 'user',
        content: '失败消息',
        createdAt: 1,
        status: 'failed',
      },
      {
        id: 'next',
        conversationId: 'chat',
        role: 'user',
        content: '新要求',
        createdAt: 2,
        status: 'pending',
      },
    ];
    expect(modelHistory(rows, 'next')).toEqual([{ role: 'user', content: '新要求' }]);
  });

  it('切换会话后响应仍属于发起会话，且同页不并发请求', async () => {
    const pending = deferred<string>();
    const request = vi.fn().mockReturnValue(pending.promise);
    const { chat, repository } = await fixture(request);
    const firstId = chat.selectedId.value;
    chat.setDraft('第一条');
    const sending = chat.send(config);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await chat.create();
    const secondId = chat.selectedId.value;
    chat.setDraft('第二个对话');
    await chat.send(config);
    expect(request).toHaveBeenCalledTimes(1);
    pending.resolve('第一个结果');
    await sending;
    expect(chat.selectedId.value).toBe(secondId);
    expect(chat.messages.value).toHaveLength(0);
    expect((await repository.messages(firstId)).at(-1)!.content).toBe('第一个结果');
    expect(chat.draft.value).toBe('第二个对话');
  });

  it('删除正在请求的会话，迟到响应不能复活记录', async () => {
    const pending = deferred<string>();
    const request = vi.fn().mockReturnValue(pending.promise);
    const { chat, repository } = await fixture(request);
    const id = chat.selectedId.value;
    chat.setDraft('需求');
    const sending = chat.send(config);
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
    await chat.remove(id);
    pending.resolve('迟到结果');
    await sending;
    expect(await repository.list()).toHaveLength(0);
    expect(await repository.messages(id)).toHaveLength(0);
  });

  it('取消后不保存迟到的增强结果', async () => {
    const pending = deferred<string>();
    const request = vi.fn().mockReturnValue(pending.promise);
    const { chat } = await fixture(request);
    chat.setDraft('需求');
    const sending = chat.send(config);
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
    chat.cancel();
    pending.resolve('迟到结果');
    await sending;
    expect(chat.messages.value).toHaveLength(1);
    expect(chat.messages.value[0]!.status).toBe('cancelled');
  });

  it('结果保存失败时保留可复制结果，不误报完成', async () => {
    const { chat, repository } = await fixture();
    const original = repository.finish;
    repository.finish = async (...args) => {
      if (args[1] === 'complete') throw Error('quota');
      return original(...args);
    };
    chat.setDraft('需求');
    await chat.send(config);
    expect(chat.unsavedResult.value?.content).toBe('增强结果');
    expect(chat.error.value).toContain('本地保存失败');
    expect(chat.messages.value[0]!.status).toBe('failed');
  });

  it('保存发送前的等待期间取消不会发出模型请求', async () => {
    const { chat, request } = await fixture();
    chat.setDraft('需求');
    const sending = chat.send(config);
    chat.cancel();
    await sending;
    expect(request).not.toHaveBeenCalled();
    expect(chat.messages.value[0]!.status).toBe('cancelled');
  });

  it('初始化将未完成消息恢复为中断，供手动重试', async () => {
    const { chat, repository } = await fixture();
    await repository.prepare(chat.selectedId.value, '未完成请求');
    chat.dispose();
    const reopened = createPromptChat(repository);
    await reopened.initialize();
    expect(reopened.messages.value[0]!.status).toBe('interrupted');
  });
});
