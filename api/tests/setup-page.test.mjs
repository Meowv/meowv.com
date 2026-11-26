import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/Meowv.Api.Modules.Auth/Api/AuthSetupPage.cs', import.meta.url), 'utf8');
const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
const management = 'YOUR_SYNTHETIC_MANAGEMENT_TOKEN_FOR_UI_TESTS';
const accessCode = 'YOUR_SYNTHETIC_ACCESS_CODE_FOR_UI_TESTS';
const moduleName = { name: 'xiaomi-camera' };

// 用内存 DOM 和合成响应验证页面状态转换，不调用账号、摄像头或真实服务。
function createPage(respond, storage = new Map()) {
  const elements = new Map();
  for (const tag of source.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    elements.set(tag[1], {
      hidden: /\bhidden\b/.test(tag[0]), value: '', textContent: '', innerHTML: '', disabled: false,
      children: [], replaceChildren() { this.children = []; this.value = ''; }, appendChild(node) { this.children.push(node); if (!this.value && !node.disabled) this.value = node.value; }, dataset: {}, style: {}, querySelector() { return this.number ??= { textContent: '' }; },
      focus() {}, select() {}, removeAttribute(key) { delete this[key]; }, reset() {
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
      createElement: () => ({ value: '', textContent: '', disabled: false }),
      querySelectorAll: () => Array.from(source.matchAll(/<[^>]+>/g), ([tag]) => tag)
        .filter(tag => tag.includes(' data-private'))
        .map(tag => elements.get(tag.match(/\bid="([^"]+)"/)?.[1])).filter(Boolean),
    },
    location: { pathname: '/nested/setup/' },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    URL: { createObjectURL: () => 'blob:synthetic-qr', revokeObjectURL() {} },
    setTimeout: () => 1,
    clearTimeout() {},
    navigator: { clipboard: { async writeText(value) { copied.push(value); } } },
    confirm(message) { prompts.push(message); return confirmation; },
    async fetch(url, init) {
      const request = { path: url.replace(/^\/nested/, ''), ...init };
      requests.push(request);
      assert.equal(request.headers['X-Api-Bootstrap-Token'], management);
      assert.equal(init.cache, 'no-store');
      const { status = 200, body, type } = await respond(request);
      return {
        status, ok: status >= 200 && status < 300, headers: { get: () => type },
        async json() { return body; }, async blob() { return body; },
      };
    },
  });
  vm.runInContext(script, context);
  return {
    element: id => elements.get(id), requests, copied, prompts, storage,
    setConfirmation(value) { confirmation = value; },
    async settle() {
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setImmediate(resolve));
        if (!vm.runInContext('busy', context)) return;
      }
      throw new Error('Page action did not settle.');
    },
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
  const module = readFileSync(new URL('../src/Meowv.Api.Modules.XiaomiCamera/Api/XiaomiCameraModule.cs', import.meta.url), 'utf8');
  assert.doesNotMatch(module, /setup\/xiaomi|XiaomiSetupPage|setup\.MapPost\("\/access-code/);
  assert.equal(existsSync(new URL('../src/Meowv.Api.Modules.XiaomiCamera/Api/XiaomiSetupPage.cs', import.meta.url)), false);
  assert.doesNotMatch(source, /setup\/xiaomi/);
});

test('music management activates, reactivates and deletes the selected device', async () => {
  let status = 'pending';
  const deviceId = 'device-1';
  const page = createPage(request => {
    if (request.path === '/api/music/setup/devices') {
      return { body: status === 'removed' ? [] : [{ deviceId, installationId: 'installation-1', deviceCode: 'BEEF-CAFE', keyFingerprint: '0123456789ABCDEF', model: '<img onerror=unsafe>', osVersion: '9', status }] };
    }
    if (request.path === '/api/music/setup/devices/device-1/activate') {
      assert.equal(request.method, 'POST');
      status = 'active';
      return { body: { deviceId, status } };
    }
    if (request.path === '/api/music/setup/devices/device-1/record') {
      assert.equal(request.method, 'DELETE');
      assert.equal(status, 'revoked');
      status = 'removed';
      return { status: 204 };
    }
    if (request.path === '/api/music/setup/devices/device-1') {
      assert.equal(request.method, 'DELETE');
      status = 'revoked';
      return { status: 204 };
    }
    return standardResponse(request);
  });
  await page.authenticate();
  await page.trigger('music-load');
  assert.match(page.element('music-device-list').innerHTML, /&lt;img onerror=unsafe&gt;/);
  assert.match(page.element('music-device-list').innerHTML, /待激活/);
  assert.equal(page.element('music-activate').hidden, false);
  page.setConfirmation(false);
  await page.trigger('music-activate');
  assert.equal(status, 'pending');
  assert.match(page.prompts.at(-1), /BEEF-CAFE.*0123456789ABCDEF/);
  page.setConfirmation(true);
  await page.trigger('music-activate');
  assert.equal(status, 'active');
  assert.equal(page.element('music-activate').hidden, true);
  page.setConfirmation(false);
  await page.trigger('music-revoke');
  assert.equal(status, 'active');
  page.setConfirmation(true);
  await page.trigger('music-revoke');
  assert.equal(status, 'revoked');
  assert.equal(page.element('music-revoke').hidden, true);
  assert.equal(page.element('music-activate').textContent, '重新激活');
  assert.equal(page.element('music-activate').hidden, false);
  assert.equal(page.element('music-delete').hidden, false);
  await page.trigger('music-activate');
  assert.equal(status, 'active');
  assert.equal(page.element('music-delete').hidden, true);
  await page.trigger('music-revoke');
  page.setConfirmation(false);
  await page.trigger('music-delete');
  assert.equal(status, 'revoked');
  page.setConfirmation(true);
  await page.trigger('music-delete');
  assert.equal(status, 'removed');
  assert.equal(page.element('music-delete').hidden, true);
  assert.equal(page.element('music-devices').children.length, 0);
  assert.equal(page.element('music-token'), undefined);
  await page.trigger('exit');
  assert.equal(page.element('music-devices').children.length, 0);
});

test('late device activation cannot update the music list after management exit', async () => {
  let finish;
  const page = createPage(request => {
    if (request.path === '/api/music/setup/devices/device-1/activate') return new Promise(resolve => { finish = resolve; });
    if (request.path === '/api/music/setup/devices')
      return { body: [{ deviceId: 'device-1', deviceCode: 'BEEF-CAFE', model: 'Test car', osVersion: '9', status: 'pending' }] };
    return standardResponse(request);
  });
  await page.authenticate();
  await page.trigger('music-load');
  const activating = page.trigger('music-activate');
  await page.trigger('exit');
  finish({ body: { deviceId: 'device-1', status: 'active' } });
  await activating;
  assert.equal(page.element('music-devices').children.length, 0);
  assert.equal(page.element('workspace').hidden, true);
});

test('QQ membership setup keeps the QR in memory and manages grants for existing devices', async () => {
  const qq = '/api/music/setup/qq';
  const deviceId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const attemptId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  let attempt = null;
  let granted = false;
  const page = createPage(request => {
    if (request.path === qq + '/session') {
      return { body: { status: 'connected', canLogin: true, attempt, devices: granted ? [deviceId] : [] } };
    }
    if (request.path === '/api/music/setup/devices') {
      return { body: [
        { deviceId: 'pending', deviceCode: 'CCCC-DDDD', model: '未激活设备', osVersion: '9', status: 'pending' },
        { deviceId, deviceCode: 'AAAA-BBBB', model: '测试车机', osVersion: '9', status: 'active' },
      ] };
    }
    if (request.path === qq + '/devices/' + deviceId) {
      assert.equal(request.method, 'PUT');
      granted = JSON.parse(request.body).enabled;
      return { status: 204 };
    }
    if (request.path === qq + '/login') {
      assert.equal(request.method, 'POST');
      attempt = { id: attemptId, status: 'pending', qrReady: true };
      return { status: 202, body: attempt };
    }
    if (request.path === qq + '/login/' + attemptId + '/qr') {
      return { type: 'image/png', body: 'synthetic image' };
    }
    if (request.path === qq + '/login/' + attemptId) {
      assert.equal(request.method, 'DELETE');
      attempt = { ...attempt, status: 'canceled', qrReady: false };
      return { status: 204 };
    }
    return standardResponse(request);
  });
  await page.authenticate();
  await page.trigger('qq-load');
  assert.equal(page.element('qq-device').children.length, 1);
  assert.equal(page.element('qq-device').value, deviceId);
  assert.equal(page.element('qq-login').textContent, '重新绑定');
  assert.equal(page.element('qq-device').value, deviceId);
  page.element('qq-grant').checked = true;
  await page.trigger('qq-save');
  assert.equal(granted, true);
  assert.match(page.element('qq-device-list').innerHTML, /测试车机/);
  assert.match(page.element('qq-device-list').innerHTML, /已授权/);
  await page.trigger('qq-login');
  assert.equal(page.element('qq-qr').src, 'blob:synthetic-qr');
  assert.equal(page.element('qq-qr-box').hidden, false);
  await page.trigger('qq-cancel');
  assert.equal(page.element('qq-qr').src, undefined);
  assert.equal(page.element('qq-qr-box').hidden, true);
  assert.match(page.element('qq-status').textContent, /已登录.*扫码已取消/);
});

test('management token survives reload and is cleared only on explicit exit', async () => {
  const page = createPage(standardResponse);
  await page.authenticate();
  assert.equal(page.storage.get('meowv.setup.bootstrapToken'), management);

  const reloaded = createPage(standardResponse, page.storage);
  await reloaded.settle();
  assert.equal(reloaded.element('gate').hidden, true);
  assert.equal(reloaded.element('workspace').hidden, false);
  assert.equal(reloaded.element('access-code').value, accessCode);
  assert.equal(reloaded.element('login-form').hidden, false);

  await reloaded.trigger('exit');
  assert.equal(reloaded.storage.has('meowv.setup.bootstrapToken'), false);
  assert.equal(reloaded.element('gate').hidden, false);
  assert.equal(reloaded.element('workspace').hidden, true);
});

test('a rejected stored token is removed so the next load asks again', async () => {
  const storage = new Map([['meowv.setup.bootstrapToken', management]]);
  const page = createPage(() => ({ status: 401, body: { message: '管理密钥无效' } }), storage);
  await page.settle();
  assert.equal(page.element('gate').hidden, false);
  assert.equal(page.element('workspace').hidden, true);
  assert.equal(page.storage.has('meowv.setup.bootstrapToken'), false);
});

test('daily chart snapshot can be refreshed from the setup page', async () => {
  let refreshes = 0;
  const page = createPage(request => {
    if (request.path === '/api/music/admin/charts/refresh') {
      assert.equal(request.method, 'POST');
      refreshes++;
      return { body: { chart: 'daily', period: '2026-11-20', items: [{ id: '1' }, { id: '2' }], partial: false, warnings: [] } };
    }
    return standardResponse(request);
  });
  await page.authenticate();
  await page.trigger('charts-refresh');
  assert.equal(refreshes, 1);
  assert.match(page.element('charts-status').textContent, /2026-11-20/);
  assert.match(page.element('charts-status').textContent, /共 2 首/);
  assert.equal(page.element('message').textContent, '每日榜单快照已刷新。');
});
