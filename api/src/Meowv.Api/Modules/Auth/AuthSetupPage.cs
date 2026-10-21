namespace Meowv.Api.Modules.Auth;

internal static class AuthSetupPage
{
    internal const string Html = """
        <!doctype html>
        <html lang="zh-CN">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width,initial-scale=1" />
            <meta name="referrer" content="no-referrer" />
            <meta name="color-scheme" content="light" />
            <title>服务初始化 · Meowv API</title>
            <style>
              :root {
                font-family:
                  Inter,
                  -apple-system,
                  BlinkMacSystemFont,
                  "Segoe UI",
                  "PingFang SC",
                  "Microsoft YaHei",
                  sans-serif;
                color: #202534;
                background: #f4f6fb;
                font-synthesis: none;
                --accent: #6554d9;
                --muted: #7b8192;
                --line: #e9ebf2;
              }
              * {
                box-sizing: border-box;
              }
              [hidden] {
                display: none !important;
              }
              body {
                margin: 0;
                min-height: 100vh;
                background:
                  radial-gradient(ellipse at 0 0, #ede9ff88, transparent 50%), #f4f6fb;
              }
              button,
              input,
              select {
                font: inherit;
              }
              button {
                cursor: pointer;
              }
              button:disabled {
                cursor: wait;
                opacity: 0.55;
              }
              input,
              select {
                width: 100%;
                min-width: 0;
                border: 1px solid #dce0ea;
                border-radius: 10px;
                padding: 12px 14px;
                background: white;
                color: inherit;
                transition: border-color 0.15s;
              }
              input::placeholder {
                color: #a0a5b3;
              }
              input:focus-visible,
              select:focus-visible,
              button:focus-visible {
                outline: 3px solid #bcb2ff;
                outline-offset: 3px;
              }
              input:focus,
              select:focus {
                border-color: var(--accent);
              }
              input[readonly] {
                background: #f7f7fc;
              }
              label {
                display: block;
                font-size: 13px;
                font-weight: 600;
                line-height: 1.5;
              }
              label input,
              label select {
                margin-top: 8px;
                font-weight: 400;
              }
              p {
                line-height: 1.75;
              }
              h1,
              h2,
              h3,
              p {
                margin: 0;
              }
              svg {
                display: block;
                flex-shrink: 0;
              }
              button {
                border: 0;
                border-radius: 10px;
                padding: 11px 17px;
                font-size: 13px;
                font-weight: 600;
                line-height: 1.5;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
              }
              .primary {
                color: white;
                background: var(--accent);
                box-shadow: 0 3px 8px #6554d926;
              }
              .primary:hover {
                background: #5948ca;
              }
              .secondary {
                background: #f0eefb;
                color: #5948bc;
              }
              .secondary:hover {
                background: #e8e3fa;
              }
              .text-button {
                padding: 6px 0;
                background: transparent;
                color: var(--muted);
                font-weight: 500;
              }
              .text-button:hover {
                color: var(--accent);
              }
              .danger {
                color: #b55050;
              }
              .shell {
                max-width: 1000px;
                min-height: 100svh;
                margin: auto;
                padding: 64px 32px;
                display: flex;
                flex-direction: column;
                justify-content: center;
              }
              .sr-only {
                position: absolute;
                width: 1px;
                height: 1px;
                padding: 0;
                margin: -1px;
                overflow: hidden;
                clip-path: inset(50%);
                white-space: nowrap;
                border: 0;
              }
              .pill {
                display: inline-flex;
                align-items: center;
                gap: 7px;
                padding: 7px 11px;
                border: 1px solid #e4e6ef;
                border-radius: 999px;
                background: #ffffffb3;
                color: #70788a;
                font-size: 11px;
                white-space: nowrap;
              }
              .pill:before {
                content: "";
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #a6acba;
              }
              .pill[data-state="done"] {
                color: #2d826a;
                background: #edf8f3;
                border-color: #d8eee4;
              }
              .pill[data-state="done"]:before {
                background: #389474;
              }
              .pill[data-state="warning"] {
                color: #ad7a31;
                background: #fff8eb;
                border-color: #f3e7cf;
              }
              .pill[data-state="warning"]:before {
                background: #d39a42;
              }
              .layout {
                display: grid;
                grid-template-columns: 220px minmax(0, 1fr);
                gap: 40px;
                align-items: start;
              }
              .intro {
                position: sticky;
                top: 48px;
                padding-top: 28px;
              }
              .steps {
                padding: 0;
                list-style: none;
                margin: 0 0 26px;
              }
              .step {
                display: flex;
                gap: 13px;
                position: relative;
                padding-bottom: 28px;
              }
              .step:last-child {
                padding-bottom: 0;
              }
              .step:not(:last-child):after {
                content: "";
                position: absolute;
                left: 14px;
                top: 35px;
                bottom: 7px;
                border-left: 1px solid #dfe1ec;
              }
              .step-number {
                width: 29px;
                height: 29px;
                display: grid;
                place-items: center;
                flex-shrink: 0;
                border: 1px solid #dce0eb;
                background: #f8f9fd;
                border-radius: 50%;
                font-size: 11px;
                color: #9a9fb0;
              }
              .step strong {
                font-size: 13px;
                font-weight: 600;
                display: block;
                margin: 3px 0 5px;
                color: #969bab;
              }
              .step p {
                font-size: 11px;
                line-height: 1.5;
                color: #a0a5b3;
              }
              .step[data-state="current"] .step-number {
                color: white;
                background: var(--accent);
                border-color: var(--accent);
                box-shadow: 0 0 0 4px #ece8fb;
              }
              .step[data-state="current"] strong {
                color: #37304f;
              }
              .step[data-state="done"] .step-number {
                color: #31866c;
                background: #e8f4ee;
                border-color: #d4e9de;
              }
              .step[data-state="done"] strong {
                color: #485862;
              }
              .step[data-state="warning"] .step-number {
                color: #b27b2e;
                background: #fff4df;
                border-color: #eddcb9;
              }
              .note {
                display: flex;
                gap: 9px;
                color: #8e94a4;
                font-size: 11px;
                line-height: 1.8;
                border-top: 1px solid #e4e6ef;
                padding-top: 20px;
              }
              .note svg {
                margin-top: 3px;
              }
              .content {
                min-width: 0;
              }
              .card {
                background: white;
                border: 1px solid #e7e9f1;
                border-radius: 16px;
                padding: 28px;
                box-shadow: 0 12px 36px #27305906;
                margin-bottom: 16px;
              }
              #gate {
                margin-bottom: 0;
              }
              .card-heading {
                display: flex;
                align-items: start;
                justify-content: space-between;
                gap: 15px;
                margin-bottom: 22px;
              }
              .card-title {
                display: flex;
                align-items: center;
                gap: 12px;
              }
              .icon {
                width: 37px;
                height: 37px;
                border-radius: 11px;
                background: #f0edfc;
                color: var(--accent);
                display: grid;
                place-items: center;
                flex-shrink: 0;
              }
              .icon.green {
                background: #edf7f1;
                color: #3c9477;
              }
              .card h2 {
                font-size: 17px;
                font-weight: 650;
                letter-spacing: -0.3px;
              }
              .caption {
                font-size: 11px;
                color: var(--muted);
                margin-top: 5px;
              }
              .description {
                font-size: 13px;
                color: var(--muted);
                margin-bottom: 23px;
              }
              .form-stack {
                display: grid;
                gap: 18px;
              }
              .form-row {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
              }
              .actions {
                display: flex;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
                margin-top: 20px;
              }
              .hint {
                font-size: 11px;
                color: #969cac;
                line-height: 1.8;
              }
              .notice {
                padding: 12px 15px;
                border-radius: 10px;
                background: #f0eefb;
                color: #6556a2;
                font-size: 12px;
                line-height: 1.8;
                margin-bottom: 18px;
                overflow-wrap: anywhere;
              }
              .notice[data-kind="error"] {
                background: #fff1f0;
                color: #ac5653;
              }
              .notice[data-kind="success"] {
                background: #edf7f1;
                color: #39836a;
              }
              .code-box {
                border: 1px solid #e5e0f6;
                background: #faf9fe;
                border-radius: 12px;
                padding: 16px;
                margin-top: 18px;
              }
              .code-box label {
                font-size: 11px;
                color: #71678e;
              }
              .code-row {
                display: flex;
                align-items: center;
                gap: 9px;
                margin-top: 9px;
              }
              .code-row input {
                font:
                  12px ui-monospace,
                  SFMono-Regular,
                  Consolas,
                  monospace;
                margin: 0;
                padding: 11px;
                background: white;
                letter-spacing: 0.1px;
              }
              .code-row button {
                padding: 10px 13px;
                flex-shrink: 0;
              }
              .code-box .hint {
                margin-top: 10px;
                color: #8b7fa0;
              }
              .divider {
                height: 1px;
                background: var(--line);
                margin: 22px 0 16px;
              }
              .card-bottom {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
              }
              .saved-state {
                display: flex;
                gap: 12px;
                align-items: center;
                padding: 17px;
                background: #f5faf7;
                border-radius: 12px;
                margin-bottom: 15px;
              }
              .saved-state strong {
                display: block;
                font-size: 13px;
                color: #3d7963;
                margin-bottom: 5px;
              }
              .saved-state p {
                font-size: 11px;
                color: #7d9387;
              }
              .verification-hint {
                font-size: 12px;
                color: var(--muted);
                line-height: 1.8;
                margin-bottom: 18px;
              }
              .status-note {
                font-size: 12px;
                line-height: 1.8;
                color: var(--muted);
              }
              .workspace-toolbar {
                text-align: right;
                margin-top: 5px;
              }
              .busy-icon {
                width: 13px;
                height: 13px;
                border: 2px solid currentColor;
                border-right-color: transparent;
                border-radius: 50%;
                animation: spin 0.7s linear infinite;
              }
              @keyframes spin {
                to {
                  transform: rotate(360deg);
                }
              }
              @media (prefers-reduced-motion: reduce) {
                * {
                  animation: none !important;
                  transition: none !important;
                }
              }
              @media (max-width: 760px) {
                .shell {
                  padding: 32px 20px;
                  justify-content: flex-start;
                }
                .layout {
                  grid-template-columns: 1fr;
                  gap: 22px;
                }
                .intro {
                  position: static;
                  padding-top: 0;
                }
                .steps {
                  display: flex;
                  gap: 12px;
                  margin: 0;
                }
                .step {
                  flex: 1;
                  gap: 9px;
                  padding: 0;
                }
                .step:not(:last-child):after,
                .step p,
                .note {
                  display: none;
                }
                .step strong {
                  font-size: 11px;
                  line-height: 1.8;
                  margin: 3px 0;
                }
                .step-number {
                  width: 25px;
                  height: 25px;
                }
                .card {
                  padding: 23px 21px;
                  border-radius: 15px;
                }
                .pill {
                  font-size: 10px;
                  padding: 6px 9px;
                }
              }
              @media (max-width: 420px) {
                .form-row {
                  grid-template-columns: 1fr;
                }
                .card-heading {
                  flex-wrap: wrap;
                }
                .card-bottom {
                  align-items: start;
                  flex-direction: column;
                }
                .code-row {
                  flex-wrap: wrap;
                }
                .code-row input {
                  flex-basis: 100%;
                }
                .steps {
                  gap: 6px;
                }
                .step {
                  gap: 6px;
                }
                .step strong {
                  font-size: 10px;
                }
              }
            </style>
          </head>
          <body>
            <div class="shell">
              <h1 class="sr-only">服务初始化</h1>
              <span id="overall-status" class="sr-only" role="status">等待初始化</span>
              <main class="layout" aria-label="服务初始化">
                <aside class="intro">
                  <ol class="steps" aria-label="初始化进度">
                    <li id="step-auth" class="step" data-state="current">
                      <span class="step-number">1</span>
                      <div>
                        <strong>验证管理权限</strong>
                        <p>使用服务管理密钥继续</p>
                      </div>
                    </li>
                    <li id="step-code" class="step">
                      <span class="step-number">2</span>
                      <div>
                        <strong>配置系统授权</strong>
                        <p>一个授权码，连接所有模块</p>
                      </div>
                    </li>
                    <li id="step-camera" class="step">
                      <span class="step-number">3</span>
                      <div>
                        <strong>接入摄像头</strong>
                        <p>登录账号，保存云端会话</p>
                      </div>
                    </li>
                  </ol>
                  <div class="note">
                    <svg
                      width="14"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.6"
                      aria-hidden="true"
                    >
                      <path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" />
                      <path d="m8.5 12 2.5 2.5 4.5-5" /></svg
                    ><span
                      >管理密钥仅保留在当前页面内存中，<br />刷新或退出后需要重新验证。</span
                    >
                  </div>
                </aside>
                <div class="content">
                  <div
                    id="message"
                    class="notice"
                    role="status"
                    aria-live="polite"
                    hidden
                  ></div>
                  <section id="gate" class="card" aria-labelledby="gate-title">
                    <div class="card-heading">
                      <div class="card-title">
                        <span class="icon" aria-hidden="true"
                          ><svg
                            width="19"
                            height="19"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.7"
                          >
                            <rect x="5" y="10" width="14" height="11" rx="3" />
                            <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg
                        ></span>
                        <div>
                          <h2 id="gate-title">验证管理权限</h2>
                          <p class="caption">欢迎使用 Meowv API</p>
                        </div>
                      </div>
                    </div>
                    <p class="description">
                      输入管理密钥，开始配置服务。已有的授权码和登录状态将自动保留。
                    </p>
                    <form id="auth-form" class="form-stack">
                      <label for="token"
                        >管理密钥<input
                          id="token"
                          type="password"
                          autocomplete="off"
                          placeholder="输入服务的管理密钥"
                          required
                      /></label>
                      <div>
                        <button id="continue" class="primary" type="submit">
                          验证并初始化 <span aria-hidden="true">→</span>
                        </button>
                      </div>
                    </form>
                  </section>
                  <div id="workspace" hidden>
                    <section class="card" aria-labelledby="code-title">
                      <div class="card-heading">
                        <div class="card-title">
                          <span class="icon" aria-hidden="true"
                            ><svg
                              width="19"
                              height="19"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="1.7"
                            >
                              <circle cx="8" cy="15" r="4" />
                              <path d="m11 12 9-9M16 6l3 3M14 8l3 3" /></svg
                          ></span>
                          <div>
                            <h2 id="code-title">系统授权码</h2>
                            <p class="caption">所有接入公共授权的模块共用</p>
                          </div>
                        </div>
                        <span id="code-status" class="pill" data-state="done"
                          >已配置</span
                        >
                      </div>
                      <p id="code-description" class="status-note"></p>
                      <div id="code-result" class="code-box" hidden>
                        <label for="access-code">你的通用授权码</label>
                        <div class="code-row">
                          <input
                            id="access-code"
                            readonly
                            autocomplete="off"
                            spellcheck="false"
                          /><button id="copy-code" class="secondary" type="button">
                            复制
                          </button>
                        </div>
                        <p class="hint">
                          请立即保存。离开页面后无法再次查看，遗失时可手动轮换。
                        </p>
                      </div>
                      <div class="divider"></div>
                      <div class="card-bottom">
                        <span class="hint">轮换后，旧授权码和旧播放票据将失效。</span
                        ><button
                          id="rotate"
                          class="text-button"
                          data-private
                          type="button"
                        >
                          生成授权码 ↗
                        </button>
                      </div>
                    </section>
                    <section class="card" aria-labelledby="camera-title">
                      <div class="card-heading">
                        <div class="card-title">
                          <span class="icon green" aria-hidden="true"
                            ><svg
                              width="19"
                              height="19"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="1.7"
                            >
                              <path d="M6 7h12l2 12H4L6 7ZM9 7V4h6v3" />
                              <circle cx="12" cy="13" r="3" /></svg
                          ></span>
                          <div>
                            <h2 id="camera-title">小米摄像头</h2>
                            <p class="caption">保存登录会话，连接你的设备</p>
                          </div>
                        </div>
                        <span id="camera-status" class="pill">待检查</span>
                      </div>
                      <p id="camera-description" class="status-note">
                        正在检查模块和登录状态…
                      </p>
                      <div id="camera-saved" class="saved-state" hidden>
                        <span aria-hidden="true">✓</span>
                        <div>
                          <strong>已保存小米登录会话</strong>
                          <p>可以使用系统授权码连接摄像头服务。</p>
                        </div>
                      </div>
                      <form id="login-form" class="form-stack" hidden>
                        <div class="form-row">
                          <label for="username"
                            >小米账号<input
                              id="username"
                              name="username"
                              autocomplete="username"
                              placeholder="手机号 / 邮箱 / 小米 ID"
                              required /></label
                          ><label for="password"
                            >账号密码<input
                              id="password"
                              name="password"
                              type="password"
                              autocomplete="current-password"
                              placeholder="输入小米账号密码"
                              required
                          /></label>
                        </div>
                        <label for="region"
                          >设备所在区域<select id="region" name="region">
                            <option value="cn">中国大陆</option>
                            <option value="de">欧洲</option>
                            <option value="us">美国</option>
                            <option value="sg">新加坡</option>
                            <option value="ru">俄罗斯</option>
                            <option value="i2">印度</option>
                          </select></label
                        >
                        <div>
                          <button class="primary" data-private type="submit">
                            登录并保存会话 <span aria-hidden="true">→</span>
                          </button>
                        </div>
                        <p class="hint">
                          账号密码和验证码不写入数据库，仅保存换取的云会话。
                        </p>
                      </form>
                      <form id="verify-form" hidden>
                        <p id="verification-hint" class="verification-hint"></p>
                        <label for="verification-code"
                          >验证码<input
                            id="verification-code"
                            name="code"
                            inputmode="numeric"
                            autocomplete="one-time-code"
                            placeholder="输入收到的验证码"
                            required
                        /></label>
                        <div class="actions">
                          <button class="primary" data-private type="submit">
                            完成验证</button
                          ><button
                            id="restart-login"
                            class="text-button"
                            data-private
                            type="button"
                          >
                            重新登录
                          </button>
                        </div>
                      </form>
                      <div class="actions">
                        <button
                          id="retry-camera"
                          class="secondary"
                          data-private
                          type="button"
                          hidden
                        >
                          重新检查</button
                        ><button
                          id="reset-session"
                          class="text-button danger"
                          data-private
                          type="button"
                          hidden
                        >
                          切换账号 / 重新登录
                        </button>
                      </div>
                    </section>
                    <div class="workspace-toolbar">
                      <button id="exit" class="text-button" data-private type="button">
                        退出管理
                      </button>
                    </div>
                  </div>
                </div>
              </main>
            </div>
            <script>
              const $ = (id) => document.getElementById(id);
              const apiRoot = location.pathname.replace(/\/setup\/?$/, "");
              let managementToken = "",
                authenticated = false,
                busy = false,
                cameraState = "pending",
                attemptId = "";
              const notify = (text, kind = "info") => {
                const node = $("message");
                node.textContent = text;
                node.dataset.kind = kind;
                node.hidden = !text;
              };
              const step = (id, state) => {
                const node = $(id);
                node.dataset.state = state;
                node.querySelector(".step-number").textContent =
                  state === "done"
                    ? "✓"
                    : id === "step-auth"
                      ? "1"
                      : id === "step-code"
                        ? "2"
                        : "3";
              };
              const badge = (id, text, state = "") => {
                const node = $(id);
                node.textContent = text;
                node.dataset.state = state;
              };
              const updateOverall = () => {
                if (!authenticated) {
                  badge("overall-status", "等待验证");
                  return;
                }
                if (cameraState === "saved" || cameraState === "disabled") {
                  badge(
                    "overall-status",
                    cameraState === "disabled" ? "系统已就绪" : "初始化完成",
                    "done",
                  );
                } else {
                  badge(
                    "overall-status",
                    cameraState === "unavailable"
                      ? "系统就绪 · 模块待修复"
                      : "系统就绪 · 待接入摄像头",
                    "warning",
                  );
                }
              };
              const setBusy = (value) => {
                busy = value;
                $("continue").disabled = value;
                document
                  .querySelectorAll("[data-private]")
                  .forEach((node) => (node.disabled = value || !authenticated));
                $("continue").innerHTML = value
                  ? '<span class="busy-icon" aria-hidden="true"></span> 正在处理…'
                  : '验证并初始化 <span aria-hidden="true">→</span>';
              };
              const request = async (path, init = {}) => {
                let response;
                try {
                  response = await fetch(apiRoot + path, {
                    ...init,
                    cache: "no-store",
                    headers: {
                      "X-Api-Bootstrap-Token": managementToken,
                      ...(init.headers || {}),
                    },
                  });
                } catch {
                  throw new Error("无法连接服务，请检查网络后重试。");
                }
                if (response.status === 204) return null;
                const data = await response.json().catch(() => null);
                if (!response.ok) {
                  if (response.status === 401) {
                    authenticated = false;
                    $("gate").hidden = false;
                    step("step-auth", "current");
                    updateOverall();
                    throw new Error("管理密钥无效或已变更，请重新验证。");
                  }
                  if (response.status === 429)
                    throw new Error("操作过于频繁，请稍后重试。");
                  throw new Error(
                    data?.message ||
                      (response.status === 503
                        ? "摄像头模块尚未就绪，请检查服务配置与 FFmpeg 后重启服务。"
                        : "操作失败，请稍后重试。"),
                  );
                }
                if (!data) throw new Error("服务返回了无法识别的响应，请稍后重试。");
                return data;
              };
              const run = async (action) => {
                if (busy) return;
                setBusy(true);
                notify("");
                try {
                  await action();
                } catch (error) {
                  notify(error.message || "操作失败，请重试。", "error");
                } finally {
                  setBusy(false);
                }
              };
              const showCode = (value, rotated = false) => {
                if (value) {
                  $("access-code").value = value;
                  $("code-result").hidden = false;
                  $("code-description").textContent = rotated
                    ? "授权码已轮换。请保存新授权码，并更新客户端配置。"
                    : "已为你生成通用授权码。保存后即可用于连接各模块。";
                } else if (!$("access-code").value) {
                  $("code-result").hidden = true;
                  $("code-description").textContent =
                    "系统已有授权码，可继续使用。已有授权码无法再次显示，遗失时请手动轮换。";
                }
                step("step-code", "done");
              };
              const showCamera = (state, text) => {
                cameraState = state;
                attemptId = "";
                $("verification-code").value = "";
                $("login-form").hidden = state !== "login";
                $("verify-form").hidden = true;
                $("camera-saved").hidden = state !== "saved";
                $("reset-session").hidden = state !== "saved";
                $("retry-camera").hidden =
                  state !== "unavailable" && state !== "disabled";
                $("camera-description").textContent = text;
                $("camera-description").hidden = state === "saved";
                $("camera-description").style.marginBottom =
                  state === "login" ? "20px" : "0";
                badge(
                  "camera-status",
                  {
                    login: "待登录",
                    saved: "已配置",
                    disabled: "未启用",
                    unavailable: "暂不可用",
                    pending: "检查中",
                  }[state],
                  state === "saved" ? "done" : state === "unavailable" ? "warning" : "",
                );
                step(
                  "step-camera",
                  state === "saved" || state === "disabled"
                    ? "done"
                    : state === "unavailable"
                      ? "warning"
                      : "current",
                );
                updateOverall();
              };
              const loadCamera = async () => {
                showCamera("pending", "正在检查模块和登录状态…");
                try {
                  const modules = await request("/api/modules");
                  if (!Array.isArray(modules))
                    throw new Error("无法读取模块信息，请重试。");
                  if (!modules.some((module) => module.name === "xiaomi-camera")) {
                    showCamera(
                      "disabled",
                      "摄像头模块未启用，系统授权已可使用。启用模块并重启服务后，可在这里继续配置。",
                    );
                    return;
                  }
                  const health = await request("/api/xiaomi-camera/health");
                  if (health.status !== "ready")
                    throw new Error(
                      "摄像头模块尚未就绪，请检查服务配置与 FFmpeg 后重启服务。",
                    );
                  const session = await request("/api/xiaomi-camera/setup/session");
                  if (session.status === "completed") showCamera("saved", "");
                  else if (session.status === "login_required")
                    showCamera("login", "登录小米账号后，服务会保存云会话供后续使用。");
                  else throw new Error("无法识别摄像头登录状态，请重新检查。");
                } catch (error) {
                  showCamera("unavailable", error.message);
                  if (!authenticated) throw error;
                }
              };
              const completeLogin = (data) => {
                $("password").value = "";
                if (data.status === "verification_required" && data.attemptId) {
                  attemptId = data.attemptId;
                  cameraState = "verification";
                  $("login-form").hidden = true;
                  $("verify-form").hidden = false;
                  $("camera-description").hidden = true;
                  $("verification-hint").textContent =
                    "请输入发送到 " +
                    (data.verificationDestination || "已绑定账号") +
                    " 的" +
                    (data.verificationKind || "验证码") +
                    "。";
                  badge("camera-status", "待验证", "warning");
                  $("verification-code").focus();
                } else if (data.status === "completed") {
                  showCamera("saved", "");
                  $("login-form").reset();
                  notify("小米登录会话已保存，初始化完成。", "success");
                } else throw new Error("无法识别登录结果，请重新登录。");
              };
              $("auth-form").onsubmit = (event) => {
                event.preventDefault();
                run(async () => {
                  managementToken = $("token").value.trim();
                  if (!managementToken) return;
                  const data = await request("/api/auth/access-code", {
                    method: "POST",
                  });
                  authenticated = true;
                  $("token").value = "";
                  $("gate").hidden = true;
                  $("workspace").hidden = false;
                  step("step-auth", "done");
                  showCode(data.accessCode);
                  await loadCamera();
                });
              };
              $("rotate").onclick = () => {
                if (!confirm("轮换将使所有模块的旧授权码和旧播放票据失效，确定继续？"))
                  return;
                run(async () => {
                  const data = await request("/api/auth/access-code/rotate", {
                    method: "POST",
                  });
                  if (!data.accessCode)
                    throw new Error("没有收到新授权码，请检查服务状态。");
                  showCode(data.accessCode, true);
                  notify("授权码已轮换，请保存新授权码。", "success");
                });
              };
              $("copy-code").onclick = async () => {
                try {
                  await navigator.clipboard.writeText($("access-code").value);
                  notify("授权码已复制，请妥善保存。", "success");
                } catch {
                  $("access-code").focus();
                  $("access-code").select();
                  notify("无法自动复制，已选中授权码，请手动复制。");
                }
              };
              $("retry-camera").onclick = () => run(loadCamera);
              $("login-form").onsubmit = (event) => {
                event.preventDefault();
                run(async () => {
                  try {
                    const input = {
                      username: $("username").value.trim(),
                      password: $("password").value,
                      region: $("region").value,
                    };
                    if (!input.username || !input.password)
                      throw new Error("请输入小米账号和密码。");
                    const data = await request("/api/xiaomi-camera/setup/login", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(input),
                    });
                    completeLogin(data);
                  } finally {
                    $("password").value = "";
                  }
                });
              };
              $("verify-form").onsubmit = (event) => {
                event.preventDefault();
                run(async () => {
                  if (!attemptId) {
                    showCamera("login", "验证已失效，请重新登录。");
                    return;
                  }
                  try {
                    const data = await request(
                      "/api/xiaomi-camera/setup/" +
                        encodeURIComponent(attemptId) +
                        "/verify",
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          code: $("verification-code").value.trim(),
                        }),
                      },
                    );
                    completeLogin(data);
                  } finally {
                    $("verification-code").value = "";
                  }
                });
              };
              $("restart-login").onclick = () => {
                showCamera("login", "请重新输入账号密码，开始新的登录验证。");
                notify("");
                $("username").focus();
              };
              $("reset-session").onclick = () => {
                if (!confirm("重新登录将清除当前小米云会话并停止现有播放，确定继续？"))
                  return;
                run(async () => {
                  await request("/api/xiaomi-camera/setup/session", {
                    method: "DELETE",
                  });
                  $("login-form").reset();
                  showCamera("login", "已清除保存的会话，请使用要绑定的账号登录。");
                  $("username").focus();
                });
              };
              $("exit").onclick = () => {
                managementToken = "";
                authenticated = false;
                attemptId = "";
                cameraState = "pending";
                $("access-code").value = "";
                $("code-result").hidden = true;
                $("auth-form").reset();
                $("login-form").reset();
                $("verify-form").reset();
                $("workspace").hidden = true;
                $("gate").hidden = false;
                step("step-auth", "current");
                step("step-code", "");
                step("step-camera", "");
                notify("");
                setBusy(false);
                updateOverall();
                $("token").focus();
              };
              setBusy(false);
            </script>
          </body>
        </html>
        """;
}