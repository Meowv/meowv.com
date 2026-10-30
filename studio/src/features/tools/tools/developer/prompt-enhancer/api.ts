import type { ModelConfig, ModelMessage } from './types';

export const CONFIG_KEY = 'meowv-studio:prompt-enhancer:config:v1';
export const REQUEST_TIMEOUT = 60_000;

export const SYSTEM_PROMPT = `You are a prompt enhancement assistant. Improve the user prompt while preserving its intent and language.

TASK:
Rewrite the user input into a clearer, more specific prompt for the target AI assistant.

CRITICAL PRIORITY - LANGUAGE CONSISTENCY:
1. You MUST detect the language of the user input above and write the enhanced prompt in that same language.
2. If the user writes in Chinese, the enhanced prompt MUST be entirely in Chinese.
3. If the user writes in English, the enhanced prompt MUST be entirely in English.
4. If the user writes in any other language, the enhanced prompt MUST use that exact same language.
5. If the user mixes languages, keep a natural matching mix. Do not translate the user's intent into a single language.
6. These language rules are behavior instructions only; never include language analysis or language labels in the output.

ENHANCEMENT REQUIREMENTS:
1. Return only the enhanced prompt text; do not add explanations, prefaces, markdown fences, labels, or analysis.
2. Do not include language labels or meta notes such as "User input is in Chinese" or "Response must be in Chinese".
3. Preserve the user's original intent, topic, constraints, and target output type. Do not answer the request.
4. Always make a substantive enhancement when possible: clarify the task, scope, constraints, and expected output.
5. If the original prompt is already clear, lightly polish it instead of returning it unchanged.
6. Keep the enhanced prompt complete and concise. Do not end with an unfinished list, dangling conjunction, or trailing colon.
7. Do not add unrelated requirements, unsupported facts, or unnecessary sections.

EXAMPLES:

User input (Chinese): "请帮我解释这段代码的功能"
Enhanced prompt: "请解释这段代码的主要功能、执行流程和关键逻辑，并指出可能需要注意事项的边界情况。"

User input (English): "Please explain what this code does"
Enhanced prompt: "Explain what this code does, including its main purpose, key control flow, and any important edge cases."

User input (Mixed): "这段代码有 bug，can you help me fix it?"
Enhanced prompt: "请分析这段代码中的 bug，explain the root cause, and provide a minimal fix with necessary verification steps."

BAD OUTPUT EXAMPLE:

User input is in Chinese → Response must be in Chinese.
请解释这段代码的主要功能

GOOD OUTPUT EXAMPLE:

请解释这段代码的主要功能、执行流程和关键逻辑，并指出可能需要注意事项的边界情况。`;

export class ModelError extends Error {}

export function endpoint(config: ModelConfig): string {
  let url: URL;
  try {
    url = new URL(config.baseUrl.trim());
  } catch {
    throw new ModelError('请填写有效的 HTTPS API 地址。');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new ModelError('API 地址必须使用 HTTPS，且不能包含凭据、查询参数或片段。');
  }
  const suffix = config.protocol === 'anthropic' ? '/messages' : '/chat/completions';
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith(suffix) ? path : `${path || '/v1'}${suffix}`;
  return url.href;
}

export function validateConfig(config: ModelConfig): void {
  if (config.protocol !== 'openai' && config.protocol !== 'anthropic') {
    throw new ModelError('请选择支持的 API 协议。');
  }
  endpoint(config);
  if (!config.apiKey.trim() || !config.model.trim()) {
    throw new ModelError('请填写 API Key 和模型名称。');
  }
}

export function loadConfig(storage: Pick<Storage, 'getItem'> = localStorage): ModelConfig | null {
  try {
    const value = JSON.parse(storage.getItem(CONFIG_KEY) ?? 'null');
    if (!value || !['baseUrl', 'apiKey', 'model'].every((key) => typeof value[key] === 'string'))
      return null;
    validateConfig(value);
    return value;
  } catch {
    return null;
  }
}

export function saveConfig(config: ModelConfig, storage: Pick<Storage, 'setItem'> = localStorage) {
  validateConfig(config);
  storage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function responseText(data: unknown, protocol: ModelConfig['protocol']): string {
  const payload = object(data);
  const choice = object(Array.isArray(payload.choices) ? payload.choices[0] : null);
  const message = object(choice.message);
  const reason = protocol === 'anthropic' ? payload.stop_reason : choice.finish_reason;
  if (reason === 'length' || reason === 'max_tokens')
    throw new ModelError('结果被输出上限截断，请缩短输入或更换模型后重试。');
  if (message.refusal || ['refusal', 'content_filter'].includes(String(reason)))
    throw new ModelError('模型拒绝了本次请求，请检查输入或更换模型。');
  if (['tool_calls', 'function_call', 'tool_use', 'pause_turn'].includes(String(reason)))
    throw new ModelError('模型没有返回最终提示词，请更换模型后重试。');
  const content = protocol === 'anthropic' ? payload.content : message.content;
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .filter((part) => object(part).type === 'text')
            .map((part) => object(part).text)
            .filter((part) => typeof part === 'string')
            .join('\n')
        : '';
  if (!text.trim()) throw new ModelError('模型返回为空或响应格式无效。');
  if (/^\s*<(think|analysis)\b/i.test(text))
    throw new ModelError('模型返回了分析内容，请更换模型后重试。');
  return text.trim();
}

function httpError(status: number, data: unknown): ModelError {
  const error = object(object(data).error);
  // 只识别错误码，不回显服务端正文，避免服务端回显凭据或用户输入。
  const code = `${error.code ?? ''} ${error.type ?? ''}`;
  if (/context|too_many_tokens|request_too_large/i.test(code) || status === 413)
    return new ModelError('当前对话超出服务的上下文限制，请新建对话或缩短输入。');
  if (status === 401 || status === 403)
    return new ModelError('鉴权失败，请检查 API Key、模型权限及服务的浏览器访问支持。');
  if (status === 429) return new ModelError('服务额度不足或请求过于频繁，请稍后重试。');
  if (status === 404) return new ModelError('接口或模型不存在，请检查 API 地址和模型名称。');
  if (status === 400) return new ModelError('服务拒绝了请求，请检查协议、模型及上下文长度。');
  return new ModelError(`模型服务返回 HTTP ${status}，请稍后重试。`);
}

export async function requestModel(
  config: ModelConfig,
  messages: ModelMessage[],
  signal: AbortSignal,
  testing = false,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  validateConfig(config);
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT);
  try {
    controller.signal.throwIfAborted();
    const anthropic = config.protocol === 'anthropic';
    const system = testing ? 'Return only OK.' : SYSTEM_PROMPT;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (anthropic) {
      headers['x-api-key'] = config.apiKey.trim();
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    } else headers.Authorization = `Bearer ${config.apiKey.trim()}`;
    const response = await fetcher(endpoint(config), {
      method: 'POST',
      headers,
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      body: JSON.stringify({
        model: config.model.trim(),
        stream: false,
        ...(anthropic ? { system, max_tokens: 4096 } : { store: false }),
        messages: anthropic ? messages : [{ role: 'system', content: system }, ...messages],
      }),
    });
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      if (response.ok) throw new ModelError('模型响应不是有效的 JSON。');
    }
    controller.signal.throwIfAborted();
    if (!response.ok) throw httpError(response.status, data);
    return responseText(data, config.protocol);
  } catch (cause) {
    if (timedOut) throw new ModelError('请求超时（60 秒），未自动重发，请手动重试。');
    if (signal.aborted) throw new ModelError('已取消请求。');
    if (cause instanceof ModelError) throw cause;
    throw new ModelError('请求失败，请检查网络、API 地址及服务的浏览器跨域访问支持。');
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
