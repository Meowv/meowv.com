import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/Meowv.Api/Modules/Auth/AuthSetupPage.cs', import.meta.url), 'utf8');
const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
const management = 'YOUR_SYNTHETIC_MANAGEMENT_TOKEN_FOR_UI_TESTS';
const accessCode = 'YOUR_SYNTHETIC_ACCESS_CODE_FOR_UI_TESTS';
const moduleName = { name: 'xiaomi-camera' };

// 用内存 DOM 和合成响应验证页面状态转换，不调用账号、摄像头或真实服务。
function createPage(respond) {
  const elements = new Map();
  for (const tag of source.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    elements.set(tag[1], {
      hidden: /\bhidden\b/.test(tag[0]), value: '', textContent: '', innerHTML: '', disabled: false,
      dataset: {}, style: {}, querySelector() { return this.number ??= { textContent: '' }; },
      focus() {}, select() {}, reset() {
        const children = { 'auth-form': ['token'], 'login-form': ['username', 'password'], 'verify-form': ['verification-code'] };
        for (const id of children[tag[1]] ?? []) elements.get(id).value = '';
      },
    });
  }
  elements.get('region').value = 'cn';
  const requests = [], copied = [], prompts = [];
  let confirmation = true;
  const context = vm.createContext({
    document: {
      getElementById: id => elements.get(id),
      querySelectorAll: () => ['rotate', 'retry-camera', 'reset-session', 'exit', 'restart-login'].map(id => elements.get(id)),
    },
    location: { pathname: '/nested/setup/' },
    navigator: { clipboard: { async writeText(value) { copied.push(value); } } },
    confirm(message) { prompts.push(message); return confirmation; },
    async fetch(url, init) {
      const request = { path: url.replace(/^\/nested/, ''), ...init };
      requests.push(request);
      assert.equal(request.headers['X-Api-Bootstrap-Token'], management);
      assert.equal(init.cache, 'no-store');
      const { status = 200, body } = await respond(request);
      return { status, ok: status >= 200 && status < 300, async json() { return body; } };
    },
  });
  vm.runInContext(script, context);
  return {
    element: id => elements.get(id), requests, copied, prompts,
    setConfirmation(value) { confirmation = value; },
    async trigger(id, event = 'onclick') {
      elements.get(id)[event]({ preventDefault() {} });
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setImmediate(resolve));
        if (!vm.runInContext('busy', context)) return;
      }
      throw new Error('Page action did not settle.');
    },
    async authenticate() {
      elements.get('token').value = management;
      await this.trigger('auth-form', 'onsubmit');
    },
  };
}

function standardResponse({ path, method }) {
  if (path === '/api/auth/access-code') return { body: { accessCode } };
  if (path === '/api/modules') return { body: [moduleName] };
  if (path === '/api/xiaomi-camera/health') return { body: { status: 'ready' } };
  if (path === '/api/xiaomi-camera/setup/session') return method === 'DELETE' ? { status: 204 } : { body: { status: 'login_required' } };
  throw new Error('Unexpected test request: ' + path);
}

test('one management entry creates a code and completes camera verification without losing the code', async () => {
  const page = createPage(request => {
    if (request.path === '/api/xiaomi-camera/setup/login') {
      assert.deepEqual(JSON.parse(request.body), { username: 'SYNTHETIC_USER', password: 'SYNTHETIC_PASSWORD', region: 'cn' });
      return { status: 202, body: { status: 'verification_required', attemptId: 'synthetic-attempt', verificationKind: '验证码', verificationDestination: '测试账号' } };
    }
    if (request.path.endsWith('/synthetic-attempt/verify')) {
      assert.deepEqual(JSON.parse(request.body), { code: '000000' });
      return { body: { status: 'completed' } };
    }
    return standardResponse(request);
  });
  assert.equal(page.element('workspace').hidden, true);
  await page.authenticate();
  assert.equal(page.element('gate').hidden, true);
  assert.equal(page.element('login-form').hidden, false);
  assert.equal(page.element('access-code').value, accessCode);
  assert.equal(page.element('token').value, '');
  page.element('username').value = 'SYNTHETIC_USER';
  page.element('password').value = 'SYNTHETIC_PASSWORD';
  await page.trigger('login-form', 'onsubmit');
  assert.equal(page.element('verify-form').hidden, false);
  assert.equal(page.element('password').value, '');
  page.element('verification-code').value = '000000';
  await page.trigger('verify-form', 'onsubmit');
  assert.equal(page.element('camera-saved').hidden, false);
  assert.equal(page.element('overall-status').textContent, '初始化完成');
  assert.equal(page.element('verification-code').value, '');
  assert.equal(page.element('access-code').value, accessCode);
  await page.trigger('copy-code');
  assert.deepEqual(page.copied, [accessCode]);
  await page.trigger('exit');
  for (const id of ['token', 'access-code', 'password', 'verification-code']) assert.equal(page.element(id).value, '');
  assert.equal(page.element('workspace').hidden, true);
});

test('existing authorization and saved camera session are reused', async () => {
  const page = createPage(request => {
    if (request.path === '/api/auth/access-code') return { body: { accessCode: null } };
    if (request.path === '/api/xiaomi-camera/setup/session') return { body: { status: 'completed' } };
    return standardResponse(request);
  });
  await page.authenticate();
  assert.equal(page.element('code-result').hidden, true);
  assert.match(page.element('code-description').textContent, /已有授权码无法再次显示/);
  assert.equal(page.element('login-form').hidden, true);
  assert.equal(page.element('camera-saved').hidden, false);
  assert.equal(page.requests.some(request => request.path.endsWith('/rotate')), false);
});

test('disabled or unavailable camera leaves system authorization usable', async () => {
  for (const scenario of ['disabled', 'unavailable']) {
    const page = createPage(request => {
      if (request.path === '/api/modules' && scenario === 'disabled') return { body: [] };
      if (request.path === '/api/xiaomi-camera/health') return { status: 503, body: { status: 'unavailable' } };
      return standardResponse(request);
    });
    await page.authenticate();
    assert.equal(page.element('access-code').value, accessCode);
    assert.equal(page.element('retry-camera').hidden, false);
    assert.equal(page.element('rotate').disabled, false);
    assert.equal(page.element('login-form').hidden, true);
    assert.equal(page.element('camera-status').textContent, scenario === 'disabled' ? '未启用' : '暂不可用');
    if (scenario === 'disabled') assert.equal(page.requests.some(request => request.path.endsWith('/health')), false);
  }
});

test('camera retries and failed logins preserve the newly issued authorization code', async () => {
  let healthy = false;
  const page = createPage(request => {
    if (request.path === '/api/xiaomi-camera/health' && !healthy) return { status: 503, body: { status: 'unavailable' } };
    if (request.path.endsWith('/setup/login')) return { status: 400, body: { message: '测试登录失败' } };
    return standardResponse(request);
  });
  await page.authenticate();
  healthy = true;
  await page.trigger('retry-camera');
  page.element('username').value = 'SYNTHETIC_USER';
  page.element('password').value = 'SYNTHETIC_PASSWORD';
  await page.trigger('login-form', 'onsubmit');
  assert.equal(page.element('message').textContent, '测试登录失败');
  assert.equal(page.element('password').value, '');
  assert.equal(page.element('access-code').value, accessCode);
  assert.equal(page.requests.filter(request => request.path === '/api/auth/access-code').length, 1);
});

test('rotation and account reset require an explicit user action and confirmation', async () => {
  const page = createPage(request => {
    if (request.path.endsWith('/rotate')) return { body: { accessCode: 'SYNTHETIC_ROTATED_CODE' } };
    return standardResponse(request);
  });
  await page.authenticate();
  const before = page.requests.length;
  page.setConfirmation(false);
  await page.trigger('rotate');
  await page.trigger('reset-session');
  assert.equal(page.requests.length, before);
  page.setConfirmation(true);
  await page.trigger('rotate');
  assert.equal(page.element('access-code').value, 'SYNTHETIC_ROTATED_CODE');
  await page.trigger('reset-session');
  assert.equal(page.requests.at(-1).method, 'DELETE');
  assert.equal(page.element('login-form').hidden, false);
  assert.equal(page.element('access-code').value, 'SYNTHETIC_ROTATED_CODE');
});

test('management rejection leaves the gate visible without initializing camera', async () => {
  const page = createPage(() => ({ status: 401, body: { message: '管理密钥无效' } }));
  await page.authenticate();
  assert.equal(page.element('gate').hidden, false);
  assert.equal(page.element('workspace').hidden, true);
  assert.equal(page.requests.length, 1);
  assert.match(page.element('message').textContent, /重新验证/);
});

test('removed camera setup page and compatibility initialization routes stay absent', () => {
  const module = readFileSync(new URL('../src/Meowv.Api/Modules/XiaomiCamera/XiaomiCameraModule.cs', import.meta.url), 'utf8');
  assert.doesNotMatch(module, /setup\/xiaomi|XiaomiSetupPage|setup\.MapPost\("\/access-code/);
  assert.equal(existsSync(new URL('../src/Meowv.Api/Modules/XiaomiCamera/XiaomiSetupPage.cs', import.meta.url)), false);
  assert.doesNotMatch(source, /setup\/xiaomi|localStorage|sessionStorage/);
});
