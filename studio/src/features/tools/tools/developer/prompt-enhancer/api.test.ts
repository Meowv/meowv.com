import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONFIG_KEY,
  endpoint,
  loadConfig,
  requestModel,
  responseText,
  saveConfig,
  SYSTEM_PROMPT,
} from './api';
import type { ModelConfig } from './types';

const config: ModelConfig = {
  protocol: 'openai',
  baseUrl: 'https://model.example.test/v1',
  apiKey: 'TEST_KEY_NOT_REAL',
  model: 'test-model',
};
const reply = (text = '增强结果') => ({
  choices: [{ finish_reason: 'stop', message: { content: text } }],
});
afterEach(() => vi.useRealTimers());

describe('模型配置与协议适配', () => {
  it('补全基础地址并保留完整、自定义接口路径', () => {
    expect(endpoint({ ...config, baseUrl: 'https://model.example.test' })).toBe(
      'https://model.example.test/v1/chat/completions',
    );
    expect(endpoint({ ...config, baseUrl: 'https://model.example.test/custom/' })).toBe(
      'https://model.example.test/custom/chat/completions',
    );
    expect(
      endpoint({ ...config, baseUrl: 'https://model.example.test/v1/chat/completions/' }),
    ).toBe('https://model.example.test/v1/chat/completions');
    expect(endpoint({ ...config, protocol: 'anthropic' })).toBe(
      'https://model.example.test/v1/messages',
    );
  });

  it.each([
    'http://model.example.test',
    'https://user:password@model.example.test',
    'https://model.example.test?key=test',
    'https://model.example.test#fragment',
  ])('拒绝不合适的地址 %s', (baseUrl) => {
    expect(() => endpoint({ ...config, baseUrl })).toThrow();
  });

  it('记忆并恢复配置，损坏配置不被使用', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    saveConfig(config, storage);
    expect(loadConfig(storage)).toEqual(config);
    data.set(CONFIG_KEY, '{invalid');
    expect(loadConfig(storage)).toBeNull();
    expect(() =>
      saveConfig(config, {
        setItem: () => {
          throw Error('unavailable');
        },
      }),
    ).toThrow();
  });

  it('OpenAI 请求保留完整多轮上下文且不请求远端保存', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(reply())));
    const messages = [
      { role: 'user' as const, content: '第一版' },
      { role: 'assistant' as const, content: '增强版本' },
      { role: 'user' as const, content: '短一点' },
    ];
    expect(await requestModel(config, messages, new AbortController().signal, false, fetcher)).toBe(
      '增强结果',
    );
    const options = fetcher.mock.calls[0]![1]!;
    expect(JSON.parse(String(options.body))).toEqual({
      model: config.model,
      stream: false,
      store: false,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    });
    expect(options.headers).toMatchObject({ Authorization: 'Bearer TEST_KEY_NOT_REAL' });
    expect(options).toMatchObject({ redirect: 'error', credentials: 'omit', cache: 'no-store' });
  });

  it('Anthropic 使用独立 system、文本块和浏览器直连头', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: '结果' }] }),
        ),
      );
    expect(
      await requestModel(
        { ...config, protocol: 'anthropic' },
        [{ role: 'user', content: '原稿' }],
        new AbortController().signal,
        false,
        fetcher,
      ),
    ).toBe('结果');
    const options = fetcher.mock.calls[0]![1]!;
    const body = JSON.parse(String(options.body));
    expect(body.system).toBe(SYSTEM_PROMPT);
    expect(body.max_tokens).toBe(4096);
    expect(body.messages).toEqual([{ role: 'user', content: '原稿' }]);
    expect(options.headers).toMatchObject({
      'x-api-key': config.apiKey,
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    expect(body.store).toBeUndefined();
  });

  it('连接测试仅发送虚构短消息和专用规则', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(reply('OK'))));
    await requestModel(
      config,
      [{ role: 'user', content: 'OK' }],
      new AbortController().signal,
      true,
      fetcher,
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body)).messages[0].content).toBe(
      'Return only OK.',
    );
  });

  it.each([
    [{ choices: [{ finish_reason: 'length' }] }, '截断'],
    [{ choices: [{ finish_reason: 'content_filter' }] }, '拒绝'],
    [{ choices: [{ finish_reason: 'tool_calls' }] }, '最终提示词'],
    [{ choices: [{ message: { content: '' } }] }, '为空'],
    [reply('<think>内部分析</think>结果'), '分析内容'],
  ])('异常结果不会当作完成保存', (data, error) => {
    expect(() => responseText(data, 'openai')).toThrow(String(error));
  });

  it.each([
    [401, '鉴权'],
    [403, '鉴权'],
    [404, '不存在'],
    [429, '额度'],
    [500, 'HTTP 500'],
  ])('处理 HTTP %s 且不回显服务器正文', async (status, reason) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: config.apiKey } }), {
        status: Number(status),
      }),
    );
    await expect(
      requestModel(config, [], new AbortController().signal, false, fetcher),
    ).rejects.toThrow(String(reason));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('上下文超限时不裁剪或自动重发', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'context_length_exceeded' } }), {
        status: 400,
      }),
    );
    await expect(
      requestModel(config, [], new AbortController().signal, false, fetcher),
    ).rejects.toThrow('上下文限制');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('网络错误不直接断言是 CORS', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      requestModel(config, [], new AbortController().signal, false, fetcher),
    ).rejects.toThrow('检查网络');
  });

  it('超时会中止请求且不自动重发', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const promise = requestModel(config, [], new AbortController().signal, false, fetcher);
    const assertion = expect(promise).rejects.toThrow('超时');
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('发送前已取消时不调用 fetch', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn<typeof fetch>();
    await expect(requestModel(config, [], controller.signal, false, fetcher)).rejects.toThrow(
      '取消',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('收到取消后忽略迟到的成功响应', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      controller.abort();
      return new Response(JSON.stringify(reply()));
    });
    await expect(requestModel(config, [], controller.signal, false, fetcher)).rejects.toThrow(
      '取消',
    );
  });
});
