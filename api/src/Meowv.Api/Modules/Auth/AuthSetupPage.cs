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
                                         font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
                                         color: #1f2937;
                                         background: #f4f6fa;
                                         font-synthesis: none;
                                         --accent: #5a50d8;
                                         --accent-dark: #4a40c2;
                                         --accent-soft: #efedfc;
                                         --muted: #6b7280;
                                         --line: #e6e9f0;
                                         --ok: #2c9a70;
                                         --warn: #bd8128;
                                       }
                                       * { box-sizing: border-box; }
                                       [hidden] { display: none !important; }
                                       body { margin: 0; min-height: 100svh; background: #f4f6fa; }
                                       h1, h2, h3, p, ol { margin: 0; }
                                       svg { display: block; flex-shrink: 0; }
                                       a { color: inherit; text-decoration: none; }
                                       button, input, select { font: inherit; }
                                       button { cursor: pointer; border: 0; }
                                       button:disabled { cursor: not-allowed; opacity: .55; }
                                       button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible {
                                         outline: 3px solid #c9c2f8;
                                         outline-offset: 2px;
                                       }
                                       input:not([type="checkbox"]), select {
                                         width: 100%;
                                         min-width: 0;
                                         border: 1px solid #dfe3ec;
                                         border-radius: 8px;
                                         padding: 10px 12px;
                                         background: #fff;
                                         color: #1f2937;
                                         font-size: 13px;
                                         transition: border-color .15s, box-shadow .15s;
                                       }
                                       input::placeholder { color: #9aa1af; }
                                       input:focus, select:focus {
                                         outline: none;
                                         border-color: var(--accent);
                                         box-shadow: 0 0 0 3px #5a50d81c;
                                       }
                                       input[readonly] { background: #f8f9fc; color: #4b5563; }
                                       label { display: block; font-size: 12px; font-weight: 600; color: #374151; }
                                       label > input, label > select { margin-top: 7px; font-weight: 400; }
                                       .check-line { display: flex; align-items: center; gap: 9px; font-weight: 500; line-height: 1.5; }
                                       #qq-grant { width: 16px; height: 16px; margin: 0; accent-color: var(--accent); flex-shrink: 0; }
                                       #qq-qr { max-width: 100%; height: auto; }
                                       .sr-only {
                                         position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
                                         overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
                                       }

                                       /* 顶栏 */
                                       .topbar {
                                         position: sticky; top: 0; z-index: 20;
                                         display: flex; align-items: center; justify-content: space-between; gap: 16px;
                                         height: 60px; padding: 0 28px;
                                         background: #fff; border-bottom: 1px solid var(--line);
                                       }
                                       .brand { display: flex; align-items: center; gap: 11px; min-width: 0; }
                                       .brand-mark {
                                         width: 32px; height: 32px; border-radius: 9px; flex-shrink: 0;
                                         display: grid; place-items: center; color: #fff;
                                         background: linear-gradient(145deg, #756be4, #5146c6);
                                       }
                                       .brand-name { font-size: 15px; font-weight: 700; letter-spacing: -.2px; white-space: nowrap; }
                                       .brand-divider { width: 1px; height: 18px; background: #dfe3ec; }
                                       .brand-sub { font-size: 12px; color: var(--muted); white-space: nowrap; }
                                       .topbar-meta { display: flex; align-items: center; gap: 12px; }
                                       .env-tag {
                                         font-size: 11px; color: #7b8496; padding: 4px 9px;
                                         border: 1px solid var(--line); border-radius: 6px; white-space: nowrap;
                                       }
                                       .global-status {
                                         display: inline-flex; align-items: center; gap: 7px;
                                         padding: 5px 11px; border-radius: 999px;
                                         background: #f3f4f8; color: #6b7280; font-size: 12px; font-weight: 600; white-space: nowrap;
                                       }
                                       .global-status:before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #9ca3af; }
                                       .global-status[data-state="done"] { background: #e9f7f0; color: #25795a; }
                                       .global-status[data-state="done"]:before { background: var(--ok); }
                                       .global-status[data-state="warning"] { background: #fff5e6; color: #a46b1c; }
                                       .global-status[data-state="warning"]:before { background: var(--warn); }

                                       /* 侧边栏 */
                                       .app-body { display: grid; grid-template-columns: 244px minmax(0, 1fr); }
                                       .sidebar {
                                         position: sticky; top: 60px; height: calc(100svh - 60px);
                                         display: flex; flex-direction: column; gap: 24px;
                                         padding: 26px 16px 20px; overflow-y: auto;
                                         background: #15203a; color: #9aa8bf;
                                       }
                                       .side-heading {
                                         padding: 0 10px; font-size: 10px; font-weight: 700;
                                         letter-spacing: .16em; text-transform: uppercase; color: #6d7d9b;
                                       }
                                       .steps { list-style: none; padding: 0; }
                                       .step { position: relative; display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 11px; padding: 0 10px 22px; }
                                       .step:last-child { padding-bottom: 0; }
                                       .step:not(:last-child):after {
                                         content: ""; position: absolute; left: 24px; top: 31px; bottom: 5px;
                                         border-left: 1px dashed #33415d;
                                       }
                                       .step-number {
                                         width: 28px; height: 28px; display: grid; place-items: center; flex-shrink: 0;
                                         border: 1px solid #3a4762; border-radius: 50%; background: #1d2940;
                                         font-size: 11px; font-weight: 700; color: #8898b3;
                                       }
                                       .step strong { display: block; margin: 3px 0 4px; font-size: 12.5px; font-weight: 600; color: #98a7bf; }
                                       .step p { font-size: 11px; line-height: 1.5; color: #647591; }
                                       .step[data-state="current"] .step-number {
                                         background: var(--accent); border-color: var(--accent); color: #fff; box-shadow: 0 0 0 4px #5a50d833;
                                       }
                                       .step[data-state="current"] strong { color: #fff; }
                                       .step[data-state="done"] .step-number { background: #1d4839; border-color: #2c7a5c; color: #8ee0ba; }
                                       .step[data-state="done"] strong { color: #c2cfdd; }
                                       .step[data-state="warning"] .step-number { background: #4a3b1f; border-color: #9a7226; color: #efc882; }
                                       .side-nav { display: grid; gap: 3px; padding-top: 20px; border-top: 1px solid #2a3753; }
                                       .nav-item {
                                         display: flex; align-items: center; gap: 10px;
                                         padding: 9px 11px; border-radius: 8px; font-size: 12.5px; color: #96a4bb;
                                         transition: background .15s, color .15s;
                                       }
                                       .nav-item:hover { background: #1e2b47; color: #fff; }
                                       .nav-dot { width: 6px; height: 6px; border-radius: 50%; background: #70809d; flex-shrink: 0; }
                                       .nav-item:nth-child(1) .nav-dot { background: #8b7ff0; }
                                       .nav-item:nth-child(2) .nav-dot { background: #57b895; }
                                       .nav-item:nth-child(3) .nav-dot { background: #d8a85e; }
                                       .nav-item:nth-child(4) .nav-dot { background: #d47791; }

                                       /* 主内容 */
                                       .main { width: 100%; max-width: 1240px; margin: 0 auto; padding: 28px 34px 70px; }
                                       .page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
                                       .eyebrow { margin-bottom: 6px; font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); }
                                       .page-title { font-size: 23px; font-weight: 700; letter-spacing: -.5px; color: #1f2937; }
                                       .page-sub { margin-top: 6px; font-size: 12px; color: var(--muted); }
                                       .workspace-toolbar { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
                                       .quick-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; }
                                       .quick-card {
                                         display: flex; align-items: center; gap: 11px; min-width: 0;
                                         padding: 13px; border: 1px solid var(--line); border-radius: 12px; background: #fff;
                                         box-shadow: 0 1px 2px #1f293705; transition: border-color .15s, transform .15s;
                                       }
                                       .quick-card:hover { border-color: #c9c3f2; transform: translateY(-1px); }
                                       .quick-icon {
                                         width: 34px; height: 34px; flex-shrink: 0; border-radius: 9px;
                                         display: grid; place-items: center; background: var(--accent-soft); color: var(--accent);
                                       }
                                       .quick-card:nth-child(2) .quick-icon { background: #e8f6ef; color: var(--ok); }
                                       .quick-card:nth-child(3) .quick-icon { background: #fff3e3; color: #b97920; }
                                       .quick-card:nth-child(4) .quick-icon { background: #fdeef2; color: #bd5578; }
                                       .quick-card strong { display: block; font-size: 12.5px; font-weight: 650; white-space: nowrap; }
                                       .quick-card small { display: block; margin-top: 3px; font-size: 10.5px; color: var(--muted); white-space: nowrap; }

                                       .panel {
                                         background: #fff; border: 1px solid var(--line); border-radius: 14px;
                                         padding: 21px 24px; margin-bottom: 18px; box-shadow: 0 1px 3px #1f293707;
                                         scroll-margin-top: 78px;
                                       }
                                       .panel:target { border-color: #c9c3f2; box-shadow: 0 0 0 3px #5a50d812; }
                                       .panel-head {
                                         display: flex; align-items: flex-start; justify-content: space-between; gap: 14px;
                                         padding-bottom: 16px; margin-bottom: 16px; border-bottom: 1px solid #f0f2f6;
                                       }
                                       .card-title { display: flex; align-items: center; gap: 12px; min-width: 0; }
                                       .icon {
                                         width: 38px; height: 38px; flex-shrink: 0; border-radius: 10px;
                                         display: grid; place-items: center; background: var(--accent-soft); color: var(--accent);
                                       }
                                       .icon.green { background: #e8f6ef; color: var(--ok); }
                                       .icon.amber { background: #fff3e3; color: #b97920; }
                                       .icon.pink { background: #fdeef2; color: #bd5578; }
                                       .panel h2 { font-size: 16px; font-weight: 700; letter-spacing: -.2px; color: #1f2937; }
                                       .caption { margin-top: 4px; font-size: 11px; color: var(--muted); }
                                       .pill {
                                         display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0;
                                         padding: 5px 10px; border: 1px solid #e4e6ef; border-radius: 999px;
                                         background: #f8f9fc; color: #70788a; font-size: 11px; white-space: nowrap;
                                       }
                                       .pill:before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #a6acba; }
                                       .pill[data-state="done"] { color: #2d826a; background: #edf8f3; border-color: #d8eee4; }
                                       .pill[data-state="done"]:before { background: var(--ok); }
                                       .pill[data-state="warning"] { color: #ad7a31; background: #fff8eb; border-color: #f3e7cf; }
                                       .pill[data-state="warning"]:before { background: var(--warn); }

                                       .form-stack { display: grid; gap: 16px; }
                                       .form-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
                                       .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
                                       .actions.tight { margin-top: 14px; }
                                       #qq-qr-box, #qq-devices { margin-top: 14px; }
                                       .hint { font-size: 11px; color: #8b93a3; line-height: 1.7; }
                                       .description { font-size: 13px; color: var(--muted); margin-bottom: 18px; line-height: 1.7; }
                                       .status-note { font-size: 12px; color: var(--muted); line-height: 1.75; }
                                       .verification-hint { font-size: 12px; color: var(--muted); line-height: 1.8; margin-bottom: 14px; }
                                       .notice {
                                         padding: 12px 15px; margin-bottom: 18px; border: 1px solid #ded9f8; border-radius: 10px;
                                         background: var(--accent-soft); color: #4d4594; font-size: 12px; line-height: 1.8; overflow-wrap: anywhere;
                                       }
                                       .notice[data-kind="error"] { background: #fff1f0; border-color: #f6d8d5; color: #ac5653; }
                                       .notice[data-kind="success"] { background: #edf7f1; border-color: #d7eee2; color: #39836a; }
                                       .code-box { padding: 15px; border: 1px solid #e4e0f5; border-radius: 11px; background: #faf9ff; }
                                       .code-box label { font-size: 11px; color: #71678e; }
                                       .code-row { display: flex; align-items: center; gap: 9px; margin-top: 9px; }
                                       .code-row input {
                                         font: 12px ui-monospace, SFMono-Regular, Consolas, monospace;
                                         letter-spacing: .1px; margin: 0;
                                       }
                                       .code-row button { flex-shrink: 0; }
                                       .code-box .hint { margin-top: 10px; color: #8b7fa0; }
                                       .divider { height: 1px; margin: 18px 0 14px; background: #f0f2f6; }
                                       .card-bottom { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
                                       .saved-state {
                                         display: flex; align-items: center; gap: 12px; padding: 14px;
                                         border: 1px solid #d7eee2; border-radius: 10px; background: #f1faf5;
                                       }
                                       .saved-state > span {
                                         width: 28px; height: 28px; flex-shrink: 0; border-radius: 50%;
                                         display: grid; place-items: center; background: #d9f1e5; color: #25805d; font-weight: 700;
                                       }
                                       .saved-state strong { display: block; font-size: 12.5px; color: #3d7963; margin-bottom: 4px; }
                                       .saved-state p { font-size: 11px; color: #7d9387; }
                                       .list-head {
                                         display: flex; align-items: center; justify-content: space-between;
                                         padding: 0 2px 8px; color: var(--muted); font-size: 11px;
                                       }
                                       .list-head strong { color: #374151; font-size: 12px; }
                                       .device-list { display: grid; gap: 8px; }
                                       .device-row {
                                         display: flex; align-items: center; gap: 10px;
                                         padding: 11px 13px; border: 1px solid var(--line); border-radius: 9px;
                                         background: #fff; cursor: pointer;
                                         transition: border-color .15s, background .15s;
                                       }
                                       .device-row:hover { border-color: #c9c3f2; background: #faf9ff; }
                                       .device-row:has(input:checked) { border-color: var(--accent); background: #f7f6fe; }
                                       .device-row input {
                                         width: 15px; height: 15px; margin: 0; flex-shrink: 0;
                                         accent-color: var(--accent);
                                       }
                                       .device-name {
                                         flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; color: #374151;
                                         overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                                       }
                                       .device-state {
                                         padding: 3px 9px; border-radius: 999px; white-space: nowrap;
                                         background: #f3f4f8; color: #6b7280; font-size: 11px; font-weight: 500;
                                       }
                                       .device-state.on { background: #e9f7f0; color: #25795a; }
                                       .device-state.off { background: #fff5e6; color: #a46b1c; }
                                       .gate-panel { max-width: 620px; padding: 28px; }
                                       .gate-panel .form-stack { gap: 18px; }

                                       /* 按钮 */
                                       .primary, .secondary, .text-button {
                                         display: inline-flex; align-items: center; justify-content: center; gap: 8px;
                                         padding: 9px 16px; border-radius: 8px; font-size: 12.5px; font-weight: 600;
                                         line-height: 1.5; white-space: nowrap; transition: background .15s, color .15s, border-color .15s;
                                       }
                                       .primary { color: #fff; background: var(--accent); box-shadow: 0 2px 6px #5a50d825; }
                                       .primary:hover { background: var(--accent-dark); }
                                       .secondary { color: #374151; background: #fff; border: 1px solid #d9dde7; }
                                       .secondary:hover { background: #f8f9fc; border-color: #c4cad8; }
                                       .text-button { padding: 8px 4px; color: var(--muted); background: transparent; }
                                       .text-button:hover { color: var(--accent); }
                                       .text-button.danger { color: #b85c55; }
                                       .text-button.danger:hover { color: #9d3d36; }
                                       .busy-icon {
                                         width: 13px; height: 13px; border: 2px solid currentColor;
                                         border-right-color: transparent; border-radius: 50%; animation: spin .7s linear infinite;
                                       }
                                       @keyframes spin { to { transform: rotate(360deg); } }
                                       @media (prefers-reduced-motion: reduce) {
                                         *, *:before, *:after { animation: none !important; transition: none !important; }
                                       }

                                       @media (max-width: 1080px) {
                                         .main { padding: 24px 22px 60px; }
                                         .app-body { grid-template-columns: 216px minmax(0, 1fr); }
                                       }
                                       @media (max-width: 900px) {
                                         .app-body { grid-template-columns: 1fr; }
                                         .sidebar {
                                           position: static; height: auto; overflow: visible; gap: 14px;
                                           padding: 14px 18px; border-bottom: 1px solid #27334d;
                                         }
                                         .side-heading { display: none; }
                                         .steps { display: flex; gap: 16px; }
                                         .step { flex: 1; grid-template-columns: 24px minmax(0, 1fr); gap: 8px; padding: 0; }
                                         .step:not(:last-child):after, .step p { display: none; }
                                         .step-number { width: 24px; height: 24px; font-size: 10px; }
                                         .step strong { margin: 2px 0 0; font-size: 11px; line-height: 1.5; }
                                         .side-nav { display: flex; gap: 4px; padding-top: 12px; border-top: 1px solid #2a3753; overflow-x: auto; }
                                         .nav-item { flex: 1 0 auto; justify-content: center; white-space: nowrap; }
                                       }
                                       @media (max-width: 640px) {
                                         .topbar { height: 56px; padding: 0 16px; }
                                         .brand-sub, .brand-divider, .env-tag { display: none; }
                                         .main { padding: 20px 14px 50px; }
                                         .page-head { align-items: flex-start; flex-direction: column; gap: 14px; }
                                         .page-title { font-size: 21px; }
                                         .quick-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                                         .panel { padding: 18px; border-radius: 12px; }
                                         .gate-panel { padding: 22px 18px; }
                                         .form-row { grid-template-columns: 1fr; }
                                         .panel-head { flex-wrap: wrap; }
                                         .card-bottom { align-items: flex-start; flex-direction: column; }
                                         .code-row { flex-wrap: wrap; }
                                         .code-row input { flex-basis: 100%; }
                                         .code-row button { width: 100%; }
                                       }
                                       @media (max-width: 420px) {
                                         .sidebar { padding: 12px; }
                                         .steps { gap: 8px; }
                                         .step { grid-template-columns: 1fr; justify-items: center; text-align: center; }
                                         .step strong { font-size: 10px; }
                                         .quick-card strong { font-size: 11.5px; }
                                         .quick-card small { font-size: 10px; }
                                       }
                                     </style>
                                   </head>
                                   <body>
                                     <div class="app">
                                       <header class="topbar">
                                         <div class="brand">
                                           <span class="brand-mark" aria-hidden="true"
                                             ><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                                               <path d="M4 7h6l2 3h8v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
                                               <path d="M8 7 9 4h6l1 3" /></svg
                                           ></span>
                                           <span class="brand-name">Meowv API</span>
                                           <span class="brand-divider"></span>
                                           <span class="brand-sub">管理控制台</span>
                                         </div>
                                         <div class="topbar-meta">
                                           <span class="env-tag">本地服务</span>
                                           <span id="overall-status" class="global-status" role="status">等待初始化</span>
                                         </div>
                                       </header>
                                       <div class="app-body">
                                         <aside class="sidebar">
                                           <div class="side-heading">初始化流程</div>
                                           <ol class="steps" aria-label="初始化进度">
                                             <li id="step-auth" class="step" data-state="current">
                                               <span class="step-number">1</span>
                                               <div><strong>验证管理权限</strong><p>使用服务管理密钥继续</p></div>
                                             </li>
                                             <li id="step-code" class="step">
                                               <span class="step-number">2</span>
                                               <div><strong>配置系统授权</strong><p>一个授权码，连接所有模块</p></div>
                                             </li>
                                             <li id="step-camera" class="step">
                                               <span class="step-number">3</span>
                                               <div><strong>接入摄像头</strong><p>登录账号，保存云端会话</p></div>
                                             </li>
                                           </ol>
                                           <nav class="side-nav" aria-label="配置分区">
                                             <a class="nav-item" href="#panel-code"><span class="nav-dot"></span>系统授权</a>
                                             <a class="nav-item" href="#panel-camera"><span class="nav-dot"></span>摄像头</a>
                                             <a class="nav-item" href="#panel-music"><span class="nav-dot"></span>音乐凭据</a>
                                             <a class="nav-item" href="#panel-qq"><span class="nav-dot"></span>QQ 会员</a>
                                           </nav>
                                         </aside>
                                         <main class="main">
                                           <h1 class="sr-only">服务初始化</h1>
                                           <div id="message" class="notice" role="status" aria-live="polite" hidden></div>
                                           <section id="gate" class="panel gate-panel" aria-labelledby="gate-title">
                                             <div class="panel-head">
                                               <div class="card-title">
                                                 <span class="icon" aria-hidden="true"
                                                   ><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
                                                     <rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg
                                                 ></span>
                                                 <div><h2 id="gate-title">验证管理权限</h2><p class="caption">欢迎使用 Meowv API</p></div>
                                               </div>
                                             </div>
                                             <p class="description">输入管理密钥，开始配置服务。已有的授权码和登录状态将自动保留。</p>
                                             <form id="auth-form" class="form-stack">
                                               <label for="token">管理密钥<input id="token" type="password" autocomplete="off" placeholder="输入服务的管理密钥" required /></label>
                                               <div><button id="continue" class="primary" type="submit">验证并初始化 <span aria-hidden="true">→</span></button></div>
                                             </form>
                                           </section>
                                           <div id="workspace" hidden>
                                             <div class="page-head">
                                               <div>
                                                 <div class="eyebrow">Setup Console</div>
                                                 <h2 class="page-title">服务初始化</h2>
                                                 <p class="page-sub">集中管理系统授权、摄像头会话与音乐设备凭据。</p>
                                               </div>
                                               <div class="workspace-toolbar">
                                                 <button id="exit" class="secondary" data-private type="button">退出管理</button>
                                               </div>
                                             </div>
                                             <div class="quick-grid" aria-label="配置分区快捷入口">
                                               <a class="quick-card" href="#panel-code">
                                                 <span class="quick-icon" aria-hidden="true"
                                                   ><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
                                                     <circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M16 6l3 3M14 8l3 3" /></svg
                                                 ></span>
                                                 <span><strong>系统授权码</strong><small>通用授权与轮换</small></span>
                                               </a>
                                               <a class="quick-card" href="#panel-camera">
                                                 <span class="quick-icon" aria-hidden="true"
                                                   ><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
                                                     <path d="M6 7h12l2 12H4L6 7ZM9 7V4h6v3" /><circle cx="12" cy="13" r="3" /></svg
                                                 ></span>
                                                 <span><strong>小米摄像头</strong><small>登录会话接入</small></span>
                                               </a>
                                               <a class="quick-card" href="#panel-music">
                                                 <span class="quick-icon" aria-hidden="true"
                                                   ><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
                                                     <path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg
                                                 ></span>
                                                 <span><strong>音乐设备</strong><small>激活与撤销</small></span>
                                               </a>
                                               <a class="quick-card" href="#panel-qq">
                                                 <span class="quick-icon" aria-hidden="true"
                                                   ><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
                                                     <path d="M12 3c-3.5 0-6 2.8-6 6.5 0 2.4-1 3.5-1 5 0 1 .8 1.7 1.8 1.7.5 2.3 2.4 3.8 5.2 3.8s4.7-1.5 5.2-3.8c1 0 1.8-.7 1.8-1.7 0-1.5-1-2.6-1-5C18 5.8 15.5 3 12 3Z" /></svg
                                                 ></span>
                                                 <span><strong>QQ 音乐会员</strong><small>扫码与设备授权</small></span>
                                               </a>
                                             </div>
                                             <section id="panel-code" class="panel" aria-labelledby="code-title">
                                               <div class="panel-head">
                                                 <div class="card-title">
                                                   <span class="icon" aria-hidden="true"
                                                     ><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
                                                       <circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M16 6l3 3M14 8l3 3" /></svg
                                                   ></span>
                                                   <div><h2 id="code-title">系统授权码</h2><p class="caption">所有接入公共授权的模块共用</p></div>
                                                 </div>
                                                 <span id="code-status" class="pill" data-state="done">已配置</span>
                                               </div>
                                               <p id="code-description" class="status-note"></p>
                                               <div id="code-result" class="code-box" hidden>
                                                 <label for="access-code">你的通用授权码</label>
                                                 <div class="code-row">
                                                   <input id="access-code" readonly autocomplete="off" spellcheck="false" />
                                                   <button id="copy-code" class="secondary" type="button">复制</button>
                                                 </div>
                                                 <p class="hint">请立即保存。离开页面后无法再次查看，遗失时可手动轮换。</p>
                                               </div>
                                               <div class="divider"></div>
                                               <div class="card-bottom">
                                                 <span class="hint">轮换后，旧授权码和旧播放票据将失效。</span>
                                                 <button id="rotate" class="text-button" data-private type="button">生成授权码 ↗</button>
                                               </div>
                                             </section>
                                             <section id="panel-camera" class="panel" aria-labelledby="camera-title">
                                               <div class="panel-head">
                                                 <div class="card-title">
                                                   <span class="icon green" aria-hidden="true"
                                                     ><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
                                                       <path d="M6 7h12l2 12H4L6 7ZM9 7V4h6v3" /><circle cx="12" cy="13" r="3" /></svg
                                                   ></span>
                                                   <div><h2 id="camera-title">小米摄像头</h2><p class="caption">保存登录会话，连接你的设备</p></div>
                                                 </div>
                                                 <span id="camera-status" class="pill">待检查</span>
                                               </div>
                                               <p id="camera-description" class="status-note">正在检查模块和登录状态…</p>
                                               <div id="camera-saved" class="saved-state" hidden>
                                                 <span aria-hidden="true">✓</span>
                                                 <div><strong>已保存小米登录会话</strong><p>可以使用系统授权码连接摄像头服务。</p></div>
                                               </div>
                                               <form id="login-form" class="form-stack" hidden>
                                                 <div class="form-row">
                                                   <label for="username">小米账号<input id="username" name="username" autocomplete="username" placeholder="手机号 / 邮箱 / 小米 ID" required /></label>
                                                   <label for="password">账号密码<input id="password" name="password" type="password" autocomplete="current-password" placeholder="输入小米账号密码" required /></label>
                                                 </div>
                                                 <label for="region">设备所在区域<select id="region" name="region">
                                                   <option value="cn">中国大陆</option><option value="de">欧洲</option><option value="us">美国</option>
                                                   <option value="sg">新加坡</option><option value="ru">俄罗斯</option><option value="i2">印度</option>
                                                 </select></label>
                                                 <div><button class="primary" data-private type="submit">登录并保存会话 <span aria-hidden="true">→</span></button></div>
                                                 <p class="hint">账号密码和验证码不写入数据库，仅保存换取的云会话。</p>
                                               </form>
                                               <form id="verify-form" hidden>
                                                 <p id="verification-hint" class="verification-hint"></p>
                                                 <label for="verification-code">验证码<input id="verification-code" name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="输入收到的验证码" required /></label>
                                                 <div class="actions tight">
                                                   <button class="primary" data-private type="submit">完成验证</button>
                                                   <button id="restart-login" class="text-button" data-private type="button">重新登录</button>
                                                 </div>
                                               </form>
                                               <div class="actions tight">
                                                 <button id="retry-camera" class="secondary" data-private type="button" hidden>重新检查</button>
                                                 <button id="reset-session" class="text-button danger" data-private type="button" hidden>切换账号 / 重新登录</button>
                                               </div>
                                             </section>
                                             <section id="panel-music" class="panel" aria-labelledby="music-title">
                                               <div class="panel-head">
                                                 <div class="card-title">
                                                   <span class="icon amber" aria-hidden="true"
                                                     ><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
                                                       <path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg
                                                   ></span>
                                                   <div><h2 id="music-title">音乐设备</h2><p class="caption">按设备激活音乐服务</p></div>
                                                 </div>
                                               </div>
                                               <p class="description">在 App 设置中核对设备码，再激活该设备。QQ 会员播放需单独授权。</p>
                                               <div class="form-stack">
                                                 <div><button id="music-load" class="secondary" data-private type="button">刷新设备列表</button></div>
                                                 <div class="list-head"><strong>音乐设备</strong><span>状态</span></div>
                                                 <select id="music-devices" aria-label="音乐设备" hidden></select>
                                                 <div id="music-device-list" class="device-list"></div>
                                                 <p id="music-status" class="hint" aria-live="polite">正在加载设备列表…</p>
                                                 <div class="actions">
                                                   <button id="music-activate" class="primary" data-private type="button" hidden>激活选中设备</button>
                                                   <button id="music-revoke" class="text-button danger" data-private type="button" hidden>撤销选中设备</button>
                                                   <button id="music-delete" class="text-button danger" data-private type="button" hidden>删除记录</button>
                                                 </div>
                                                 <div class="divider"></div>
                                                 <div class="list-head"><strong>每日榜单快照</strong></div>
                                                 <p id="charts-status" class="hint">可手动强制刷新每日榜单快照，生成后各设备立即可用。</p>
                                                 <div><button id="charts-refresh" class="secondary" data-private type="button">强制刷新榜单</button></div>
                                               </div>
                                             </section>
                                             <section id="panel-qq" class="panel" aria-labelledby="qq-title">
                                               <div class="panel-head">
                                                 <div class="card-title">
                                                   <span class="icon pink" aria-hidden="true"
                                                     ><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
                                                       <path d="M12 3c-3.5 0-6 2.8-6 6.5 0 2.4-1 3.5-1 5 0 1 .8 1.7 1.8 1.7.5 2.3 2.4 3.8 5.2 3.8s4.7-1.5 5.2-3.8c1 0 1.8-.7 1.8-1.7 0-1.5-1-2.6-1-5C18 5.8 15.5 3 12 3Z" /></svg
                                                   ></span>
                                                   <div><h2 id="qq-title">QQ 音乐会员</h2><p class="caption">扫码登录、扫码状态与设备播放权限</p></div>
                                                 </div>
                                               </div>
                                               <p id="qq-status" class="status-note" role="status">正在加载 QQ 音乐状态…</p>
                                               <div class="actions tight">
                                                 <button id="qq-load" class="secondary" data-private type="button">刷新状态</button>
                                                 <button id="qq-login" class="primary" data-private type="button" hidden>扫码登录</button>
                                                 <button id="qq-cancel" class="text-button" data-private type="button" hidden>取消扫码</button>
                                                 <button id="qq-logout" class="text-button danger" data-private type="button" hidden>退出 QQ 音乐</button>
                                               </div>
                                               <div id="qq-qr-box" class="form-stack" hidden>
                                                 <p class="hint">打开 QQ 音乐 App 扫一扫，并在手机上确认。</p>
                                                 <img id="qq-qr" width="224" height="224" alt="QQ 音乐登录二维码" />
                                               </div>
                                               <div id="qq-devices" class="form-stack" hidden>
                                                 <div class="list-head"><strong>已激活设备</strong><span>会员权限</span></div>
                                                 <select id="qq-device" data-private hidden></select>
                                                 <div id="qq-device-list" class="device-list"></div>
                                                 <label class="check-line"><input id="qq-grant" data-private type="checkbox" /> 允许选中设备播放 QQ 音乐会员曲目</label>
                                                 <div><button id="qq-save" class="secondary" data-private type="button">保存设备权限</button></div>
                                               </div>
                                             </section>
                                           </div>
                                         </main>
                                       </div>
                                     </div>
                                     <script>
                                       const $ = (id) => document.getElementById(id);
                                       const apiRoot = location.pathname.replace(/\/setup\/?$/, "");
                                        let managementEpoch = 0;
                                        let managementToken = "",
                                          authenticated = false,
                                          busy = false,
                                          cameraState = "pending",
                                          attemptId = "";
                                        const savedTokenKey = "meowv.setup.bootstrapToken";
                                        const readSavedToken = () => {
                                          try { return globalThis.localStorage?.getItem(savedTokenKey) || ""; }
                                          catch { return ""; }
                                        };
                                        const saveToken = (value) => {
                                          try { globalThis.localStorage?.setItem(savedTokenKey, value); }
                                          catch {}
                                        };
                                        const clearSavedToken = () => {
                                          try { globalThis.localStorage?.removeItem(savedTokenKey); }
                                          catch {}
                                        };
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
                                       let qqTimer = 0, qqImage = "", qqImageFor = "", qqAttempt = "", qqEnabled = new Set();
                                       const clearQQImage = () => {
                                         if (qqImage) {
                                           URL.revokeObjectURL(qqImage);
                                           $("qq-qr").removeAttribute("src");
                                         }
                                         qqImage = "";
                                         qqImageFor = "";
                                         $("qq-qr-box").hidden = true;
                                       };
                                       const resetQQ = () => {
                                         if (qqTimer) clearTimeout(qqTimer);
                                         qqTimer = 0;
                                         clearQQImage();
                                         qqAttempt = "";
                                         qqEnabled.clear();
                                         $("qq-devices").hidden = true;
                                         $("qq-device").replaceChildren();
                                         $("qq-login").hidden = true;
                                         $("qq-cancel").hidden = true;
                                         $("qq-logout").hidden = true;
                                         $("qq-status").textContent = "刷新状态后管理登录和设备。";
                                       };
                                       const request = async (path, init = {}, image = false) => {
                                         const epoch = managementEpoch;
                                         if (!managementToken) throw new Error("管理会话已结束，请重新验证。");
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
                                         if (epoch !== managementEpoch) throw new Error("管理会话已结束，请重新验证。");
                                         if (response.status === 204) return null;
                                         if (image && response.ok) {
                                           if (!response.headers.get("Content-Type")?.startsWith("image/png")) throw new Error("二维码格式无效。");
                                           const blob = await response.blob();
                                           if (epoch !== managementEpoch) throw new Error("管理会话已结束，请重新验证。");
                                           return blob;
                                         }
                                         const data = await response.json().catch(() => null);
                                         if (epoch !== managementEpoch) throw new Error("管理会话已结束，请重新验证。");
                                         if (!response.ok) {
                                            if (response.status === 401) {
                                              managementEpoch++;
                                              authenticated = false;
                                              managementToken = "";
                                              clearSavedToken();
                                              resetMusicDevices();
                                             resetQQ();
                                              $("access-code").value = "";
                                              $("code-result").hidden = true;
                                              $("music-device-list").replaceChildren();
                                              $("qq-device-list").replaceChildren();
                                              $("workspace").hidden = true;
                                              $("gate").hidden = false;
                                              step("step-auth", "current");
                                             updateOverall();
                                             setBusy(false);
                                             notify("管理密钥无效或已变更，请重新验证。", "error");
                                             throw new Error("管理密钥无效或已变更，请重新验证。");
                                           }
                                           if (response.status === 429)
                                             throw new Error("操作过于频繁，请稍后重试。");
                                           throw new Error(
                                             data?.error?.message || data?.message ||
                                               (path.startsWith("/api/music/") ? "音乐凭据管理不可用，请检查模块配置。" : "") ||
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
                                         let epoch = managementEpoch;
                                         try {
                                           const work = action();
                                           epoch = managementEpoch;
                                           await work;
                                         } catch (error) {
                                           if (epoch === managementEpoch) notify(error.message || "操作失败，请重试。", "error");
                                         } finally {
                                           if (epoch === managementEpoch) setBusy(false);
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
                                        const startSession = async (token) => {
                                          managementEpoch++;
                                          managementToken = token.trim();
                                          if (!managementToken) return;
                                          const data = await request("/api/auth/access-code", {
                                            method: "POST",
                                          });
                                          authenticated = true;
                                          saveToken(managementToken);
                                          $("token").value = "";
                                          $("gate").hidden = true;
                                          $("workspace").hidden = false;
                                          step("step-auth", "done");
                                         showCode(data.accessCode);
                                         await loadCamera();
                                         loadMusicDevices().catch((error) => { $("music-status").textContent = error.message; });
                                         loadQQ(true).catch((error) => { $("qq-status").textContent = error.message; });
                                       };
                                        $("auth-form").onsubmit = (event) => {
                                          event.preventDefault();
                                          run(() => startSession($("token").value));
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
                                       const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
                                         "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
                                       })[char]);
                                       const deviceRow = (name, id, label, selected, state, stateClass) =>
                                         '<label class="device-row">' +
                                           '<input type="radio" name="' + name + '" value="' + escapeHtml(id) + '"' +
                                             (id === selected ? " checked" : "") + ' />' +
                                           '<span class="device-name">' + escapeHtml(label) + '</span>' +
                                           '<span class="device-state ' + stateClass + '">' + state + '</span>' +
                                         '</label>';
                                       $("music-device-list").onchange = (event) => {
                                         if (event.target?.name !== "music-device") return;
                                         $("music-devices").value = event.target.value;
                                         syncMusicActions();
                                       };
                                       $("qq-device-list").onchange = (event) => {
                                         if (event.target?.name !== "qq-device") return;
                                         $("qq-device").value = event.target.value;
                                         $("qq-grant").checked = qqEnabled.has(event.target.value);
                                       };
                                       let musicDevices = [];
                                       const deviceLabel = (device) => [device.deviceCode, device.model, "Android " + device.osVersion].join(" · ");
                                       const selectedMusicDevice = () => musicDevices.find(d => d.deviceId === $("music-devices").value);
                                       const syncMusicActions = () => {
                                         const status = selectedMusicDevice()?.status;
                                         $("music-activate").hidden = status !== "pending" && status !== "revoked";
                                         $("music-activate").textContent = status === "revoked" ? "重新激活" : "激活选中设备";
                                         $("music-delete").hidden = status !== "revoked";
                                         $("music-revoke").hidden = status !== "active" && status !== "pending";
                                       };
                                       const resetMusicDevices = () => {
                                         musicDevices = [];
                                         $("music-devices").replaceChildren();
                                         syncMusicActions();
                                       };
                                       const loadMusicDevices = async () => {
                                         const devices = await request("/api/music/setup/devices");
                                         if (!Array.isArray(devices)) throw new Error("设备列表格式无效。");
                                         musicDevices = devices;
                                         const selected = devices.some(d => d.deviceId === $("music-devices").value)
                                           ? $("music-devices").value
                                           : (devices.find(d => d.status !== "revoked")?.deviceId || devices[0]?.deviceId || "");
                                         $("music-devices").replaceChildren();
                                         const labels = { pending: "待激活", active: "已激活", revoked: "已撤销" };
                                         devices.forEach((device) => {
                                           const option = document.createElement("option");
                                           option.value = device.deviceId;
                                           option.textContent = deviceLabel(device);
                                           $("music-devices").appendChild(option);
                                         });
                                         $("music-devices").value = selected;
                                         $("music-device-list").innerHTML = devices.map(device =>
                                           deviceRow("music-device", device.deviceId, deviceLabel(device), selected,
                                             labels[device.status] || "未知", device.status === "active" ? "on" : "off")
                                         ).join("") || '<p class="hint">暂无设备登记。</p>';
                                         $("music-status").textContent = "";
                                         syncMusicActions();
                                       };
                                       $("music-load").onclick = () => run(loadMusicDevices);
                                       $("music-activate").onclick = () => {
                                         const device = selectedMusicDevice();
                                         if (!device || (device.status !== "pending" && device.status !== "revoked")) return;
                                         const action = device.status === "revoked" ? "重新激活" : "激活";
                                         if (!confirm("请核对 App 中的设备码 " + device.deviceCode + " 和公钥指纹 " + device.keyFingerprint + "。两项一致后确认" + action + "。")) return;
                                         run(async () => {
                                           await request("/api/music/setup/devices/" + encodeURIComponent(device.deviceId) + "/activate", { method: "POST" });
                                           await loadMusicDevices();
                                           if (!$("qq-devices").hidden) await loadQQ(true);
                                           $("music-status").textContent = "设备已激活。";
                                         });
                                       };
                                       $("music-revoke").onclick = () => {
                                         const device = selectedMusicDevice();
                                         if (!device || device.status === "revoked" || !confirm("确认撤销设备 " + device.deviceCode + "？")) return;
                                         run(async () => {
                                           await request("/api/music/setup/devices/" + encodeURIComponent(device.deviceId), { method: "DELETE" });
                                           await loadMusicDevices();
                                           if (!$("qq-devices").hidden) await loadQQ(true);
                                           $("music-status").textContent = "设备已撤销。";
                                         });
                                       };
                                       $("music-delete").onclick = () => {
                                         const device = selectedMusicDevice();
                                         if (device?.status !== "revoked" ||
                                             !confirm("确认删除设备 " + device.deviceCode + " 的记录？App 下次检查状态时会以同一设备码重新登记为待激活设备。")) return;
                                         run(async () => {
                                           await request("/api/music/setup/devices/" + encodeURIComponent(device.deviceId) + "/record", { method: "DELETE" });
                                           await loadMusicDevices();
                                           $("music-status").textContent = "设备记录已删除。";
                                         });
                                       };
                                       const qqRoot = "/api/music/setup/qq";
                                       $("charts-refresh").onclick = () => run(async () => {
                                         const page = await request("/api/music/admin/charts/refresh", { method: "POST" });
                                         const period = page?.period || "";
                                         const count = Array.isArray(page?.items) ? page.items.length : 0;
                                         const partial = page?.partial ? "（部分来源失败）" : "";
                                         $("charts-status").textContent = "已刷新" + (period ? " " + period : "") + " 的每日榜单" + (count ? "，共 " + count + " 首" : "") + partial + "。";
                                         notify("每日榜单快照已刷新。", "success");
                                       });

                                       const loadQQDevices = async () => {
                                         const devices = await request("/api/music/setup/devices");
                                         if (!Array.isArray(devices)) throw new Error("设备列表格式无效。");
                                         const active = devices.filter(device => device.status === "active");
                                         const selected = active.some(device => device.deviceId === $("qq-device").value)
                                           ? $("qq-device").value : (active[0]?.deviceId || "");
                                         $("qq-device").replaceChildren();
                                         active.forEach((device) => {
                                           const option = document.createElement("option");
                                           option.value = device.deviceId;
                                           option.textContent = deviceLabel(device);
                                           $("qq-device").appendChild(option);
                                         });
                                         if (selected) $("qq-device").value = selected;
                                         $("qq-device-list").innerHTML = active.map((device) =>
                                           deviceRow("qq-device", device.deviceId, deviceLabel(device), selected, qqEnabled.has(device.deviceId) ? "已授权" : "未授权",
                                             qqEnabled.has(device.deviceId) ? "on" : "off")
                                         ).join("") || '<p class="hint">暂无已激活的设备。</p>';
                                         $("qq-grant").checked = qqEnabled.has(selected);
                                       };
                                       const loadQQ = async (devices = false) => {
                                         if (qqTimer) clearTimeout(qqTimer);
                                         qqTimer = 0;
                                         const epoch = managementEpoch;
                                         const data = await request(qqRoot + "/session");
                                         if (epoch !== managementEpoch) return;
                                         if (!data || !Array.isArray(data.devices)) throw new Error("QQ 音乐状态无效。");
                                         qqEnabled = new Set(data.devices);
                                         const active = ["starting", "pending", "scanned"].includes(data.attempt?.status);
                                         qqAttempt = active ? data.attempt.id : "";
                                         const ready = data.attempt?.qrReady && active;
                                         const usable = data.canLogin === true;
                                         const labels = { disabled: "会员播放未启用", unavailable: "会话不可用，请检查后端配置", signed_out: "未登录", connected: "已登录", expired: "会话已失效，请重新扫码" };
                                         const attempts = { starting: "正在生成二维码", pending: "等待扫码", scanned: "已扫码，请在手机上确认", succeeded: "扫码登录成功", expired: "二维码已过期", canceled: "扫码已取消", denied: "手机端取消了登录", failed: "扫码失败，请重试" };
                                         const configuration = {
                                           session_key_missing: "缺少 QQ 会话加密密钥（Modules:Music:QQMusicSessionKey）。配置后重启后端。",
                                           session_key_invalid: "QQ 会话加密密钥格式错误。请使用 32 字节随机值的 Base64 编码，配置后重启后端。",
                                         };
                                         $("qq-status").textContent = [configuration[data.configurationIssue] || labels[data.status], attempts[data.attempt?.status]].filter(Boolean).join(" · ");
                                         $("qq-login").hidden = !usable || active;
                                         $("qq-login").textContent = data.status === "connected" ? "重新绑定" : "扫码登录";
                                         $("qq-cancel").hidden = !active;
                                         $("qq-logout").hidden = !usable || !["connected", "expired", "unavailable"].includes(data.status);
                                         $("qq-devices").hidden = !usable;
                                         if (!ready) clearQQImage();
                                         if (ready && qqImageFor !== qqAttempt) {
                                           const requested = qqAttempt;
                                           try {
                                             const blob = await request(qqRoot + "/login/" + encodeURIComponent(requested) + "/qr", {}, true);
                                             if (epoch !== managementEpoch || qqAttempt !== requested) return;
                                             clearQQImage();
                                             qqImage = URL.createObjectURL(blob);
                                             qqImageFor = requested;
                                             $("qq-qr").src = qqImage;
                                             $("qq-qr-box").hidden = false;
                                           } catch (error) {
                                             if (epoch === managementEpoch && qqAttempt === requested) $("qq-status").textContent = error.message;
                                           }
                                         }
                                         if (devices && usable) await loadQQDevices();
                                         if (active && epoch === managementEpoch) qqTimer = setTimeout(() => loadQQ().catch((error) => {
                                           if (epoch === managementEpoch) $("qq-status").textContent = error.message;
                                         }), 2500);
                                       };
                                       $("qq-load").onclick = () => run(() => loadQQ(true));
                                       $("qq-login").onclick = () => run(async () => {
                                         await request(qqRoot + "/login", { method: "POST" });
                                         await loadQQ();
                                       });
                                       $("qq-cancel").onclick = () => run(async () => {
                                         if (qqTimer) clearTimeout(qqTimer);
                                         if (qqAttempt) await request(qqRoot + "/login/" + encodeURIComponent(qqAttempt), { method: "DELETE" });
                                         await loadQQ();
                                       });
                                       $("qq-logout").onclick = () => run(async () => {
                                         if (!confirm("确定退出 QQ 音乐？指定设备会恢复当前公开可播曲库。")) return;
                                         if (qqTimer) clearTimeout(qqTimer);
                                         await request(qqRoot + "/session", { method: "DELETE" });
                                         await loadQQ();
                                       });
                                       $("qq-device").onchange = () => { $("qq-grant").checked = qqEnabled.has($("qq-device").value); };
                                       $("qq-save").onclick = () => run(async () => {
                                         const id = $("qq-device").value;
                                         if (!id) throw new Error("请先激活并选择一个音乐设备。");
                                         await request(qqRoot + "/devices/" + encodeURIComponent(id), {
                                           method: "PUT", headers: { "Content-Type": "application/json" },
                                           body: JSON.stringify({ enabled: $("qq-grant").checked }),
                                         });
                                         await loadQQ(true);
                                       });
                                        $("exit").onclick = () => {
                                          managementEpoch++;
                                          resetMusicDevices();
                                          clearSavedToken();
                                          resetQQ();
                                          $("music-device-list").replaceChildren();
                                          $("qq-device-list").replaceChildren();
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
                                        const savedToken = readSavedToken();
                                        if (savedToken) run(() => startSession(savedToken));
                                     </script>
                                   </body>
                                 </html>
                                 """;
}