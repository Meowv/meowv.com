namespace Meowv.Api.Modules.Diagnostics;

internal static class EndpointCatalogPage
{
    internal const string Html = """
                                 <!doctype html>
                                 <html lang="zh-CN">
                                   <head>
                                     <meta charset="utf-8" />
                                     <meta name="viewport" content="width=device-width,initial-scale=1" />
                                     <title>接口目录 · Meowv API</title>
                                     <style>
                                       :root {
                                         font-family:
                                           -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
                                           "Microsoft YaHei", sans-serif;
                                         color: #252a39;
                                         background: #f5f6fb;
                                         font-synthesis: none;
                                       }
                                       * {
                                         box-sizing: border-box;
                                       }
                                       body {
                                         margin: 0;
                                       }
                                       main {
                                         max-width: 1100px;
                                         margin: auto;
                                         padding: 48px 28px;
                                       }
                                       header {
                                         display: flex;
                                         justify-content: space-between;
                                         align-items: center;
                                         gap: 20px;
                                         margin-bottom: 26px;
                                       }
                                       h1 {
                                         font-size: 25px;
                                         margin: 0 0 8px;
                                         font-weight: 650;
                                       }
                                       h2 {
                                         font-size: 16px;
                                         margin: 0;
                                       }
                                       p {
                                         font-size: 12px;
                                         color: #83899a;
                                         line-height: 1.7;
                                         margin: 6px 0 0;
                                       }
                                       a {
                                         font-size: 12px;
                                         color: #6554d9;
                                         text-decoration: none;
                                       }
                                       a:hover {
                                         text-decoration: underline;
                                       }
                                       .filters {
                                         display: flex;
                                         gap: 12px;
                                         margin-bottom: 22px;
                                       }
                                       input,
                                       select,
                                       button {
                                         font: inherit;
                                         font-size: 13px;
                                         border: 1px solid #e0e3ed;
                                         border-radius: 9px;
                                         padding: 11px 13px;
                                         background: white;
                                         color: inherit;
                                       }
                                       input {
                                         flex: 1;
                                         min-width: 0;
                                       }
                                       select {
                                         max-width: 210px;
                                       }
                                       button {
                                         color: #6554d9;
                                         cursor: pointer;
                                         flex-shrink: 0;
                                       }
                                       button:disabled {
                                         opacity: 0.5;
                                         cursor: wait;
                                       }
                                       input:focus-visible,
                                       select:focus-visible,
                                       button:focus-visible,
                                       a:focus-visible {
                                         outline: 3px solid #bcb2ff;
                                         outline-offset: 3px;
                                       }
                                       section {
                                         border: 1px solid #e5e8f0;
                                         border-radius: 13px;
                                         background: white;
                                         margin-bottom: 18px;
                                         overflow: hidden;
                                       }
                                       .module-heading {
                                         display: flex;
                                         justify-content: space-between;
                                         align-items: center;
                                         gap: 16px;
                                         padding: 21px 23px;
                                         border-bottom: 1px solid #eef0f5;
                                       }
                                       .count {
                                         font-size: 11px;
                                         color: #9399a8;
                                         white-space: nowrap;
                                       }
                                       table {
                                         border-collapse: collapse;
                                         width: 100%;
                                         table-layout: fixed;
                                       }
                                       th {
                                         text-align: left;
                                         font-size: 11px;
                                         font-weight: 500;
                                         color: #959baa;
                                         background: #fcfcfe;
                                         padding: 12px 23px;
                                       }
                                       td {
                                         padding: 14px 23px;
                                         border-top: 1px solid #f0f1f6;
                                         font-size: 12px;
                                         vertical-align: top;
                                         line-height: 1.65;
                                       }
                                       th:first-child {
                                         width: 130px;
                                       }
                                       th:last-child {
                                         width: 170px;
                                       }
                                       code {
                                         font:
                                           12px ui-monospace,
                                           SFMono-Regular,
                                           Consolas,
                                           monospace;
                                         overflow-wrap: anywhere;
                                         line-height: 1.8;
                                         color: #485067;
                                       }
                                       .method {
                                         display: inline-block;
                                         padding: 2px 7px;
                                         border-radius: 5px;
                                         background: #f1f2f6;
                                         color: #6c7488;
                                         font:
                                           10px ui-monospace,
                                           SFMono-Regular,
                                           Consolas,
                                           monospace;
                                         margin: 0 4px 3px 0;
                                       }
                                       .method[data-method="GET"] {
                                         background: #e9f6ef;
                                         color: #2f8b65;
                                       }
                                       .method[data-method="POST"] {
                                         background: #f0edfb;
                                         color: #7157c1;
                                       }
                                       .method[data-method="DELETE"] {
                                         background: #fff0ef;
                                         color: #b3605b;
                                       }
                                       .method[data-method="PUT"],
                                       .method[data-method="PATCH"] {
                                         background: #fff7e8;
                                         color: #b58938;
                                       }
                                       .authorization {
                                         font-size: 11px;
                                         color: #798196;
                                         overflow-wrap: anywhere;
                                       }
                                       #message {
                                         padding: 15px;
                                         color: #a95656;
                                         background: #fff0ef;
                                         border-radius: 9px;
                                         margin-bottom: 18px;
                                         font-size: 12px;
                                       }
                                       #empty {
                                         padding: 38px;
                                         text-align: center;
                                         font-size: 13px;
                                         color: #959baa;
                                       }
                                       [hidden] {
                                         display: none !important;
                                       }
                                       @media (max-width: 640px) {
                                         main {
                                           padding: 28px 16px;
                                         }
                                         .filters {
                                           flex-wrap: wrap;
                                           gap: 9px;
                                         }
                                         .filters input {
                                           flex-basis: 100%;
                                         }
                                         select {
                                           flex: 1;
                                           max-width: none;
                                         }
                                         .module-heading {
                                           padding: 18px 15px;
                                         }
                                         th,
                                         td {
                                           padding: 12px 10px;
                                         }
                                         th:first-child {
                                           width: 82px;
                                         }
                                         th:last-child {
                                           width: 100px;
                                         }
                                         code {
                                           font-size: 11px;
                                         }
                                         .method {
                                           font-size: 9px;
                                           padding: 2px 5px;
                                         }
                                         h1 {
                                           font-size: 22px;
                                         }
                                       }
                                     </style>
                                   </head>
                                   <body>
                                     <main>
                                       <header>
                                         <div>
                                           <h1>接口目录</h1>
                                           <p id="summary" role="status">正在读取已注册的接口…</p>
                                         </div>
                                         <a id="setup-link" href="/setup">服务初始化 ↗</a>
                                       </header>
                                       <div class="filters">
                                         <input
                                           id="search"
                                           type="search"
                                           aria-label="搜索接口"
                                           placeholder="搜索模块、路径、请求方式或认证要求"
                                           autocomplete="off"
                                         />
                                         <select id="module-filter" aria-label="筛选模块">
                                           <option value="">所有模块</option>
                                         </select>
                                         <button id="refresh" type="button">刷新</button>
                                       </div>
                                       <div id="message" role="alert" hidden></div>
                                       <div id="catalog"></div>
                                       <p id="empty" hidden>没有匹配的接口。</p>
                                     </main>
                                     <script>
                                       const $ = (id) => document.getElementById(id);
                                       const apiRoot = location.pathname.replace(/\/api\/docs\/?$/, "");
                                       $("setup-link").href = apiRoot + "/setup";
                                       let modules = [];
                                       const element = (tag, text, className) => {
                                         const node = document.createElement(tag);
                                         if (text !== undefined) node.textContent = text;
                                         if (className) node.className = className;
                                         return node;
                                       };
                                       const render = () => {
                                         const query = $("search").value.trim().toLowerCase(),
                                           selected = $("module-filter").value;
                                         const container = $("catalog");
                                         container.replaceChildren();
                                         let count = 0,
                                           visibleModules = 0;
                                         for (const module of modules) {
                                           if (selected && module.name !== selected) continue;
                                           const routes = module.endpoints.filter((route) =>
                                             [
                                               module.name,
                                               module.description,
                                               route.path,
                                               route.methods.join(" "),
                                               route.authorization,
                                             ]
                                               .join(" ")
                                               .toLowerCase()
                                               .includes(query),
                                           );
                                           if (!routes.length) continue;
                                           count += routes.length;
                                           visibleModules++;
                                           const section = element("section"),
                                             heading = element("div", undefined, "module-heading"),
                                             title = element("div");
                                           title.append(
                                             element("h2", module.name),
                                             element("p", module.description),
                                           );
                                           heading.append(
                                             title,
                                             element("span", routes.length + " 个接口", "count"),
                                           );
                                           section.append(heading);
                                           const table = element("table"),
                                             thead = element("thead"),
                                             header = element("tr");
                                           for (const text of ["请求方式", "路径", "认证要求"]) {
                                             const cell = element("th", text);
                                             cell.scope = "col";
                                             header.append(cell);
                                           }
                                           thead.append(header);
                                           table.append(thead);
                                           const tbody = element("tbody");
                                           for (const route of routes) {
                                             const row = element("tr"),
                                               method = element("td"),
                                               path = element("td"),
                                               authorization = element(
                                                 "td",
                                                 route.authorization,
                                                 "authorization",
                                               );
                                             for (const verb of route.methods) {
                                               const badge = element("span", verb, "method");
                                               badge.dataset.method = verb;
                                               method.append(badge);
                                             }
                                             path.append(element("code", route.path));
                                             authorization.title =
                                               {
                                                 管理密钥: "请求头 X-Api-Bootstrap-Token",
                                                 通用授权码: "请求头 Authorization: Bearer 授权码",
                                                 播放票据: "路径中的 ticket，由播放会话接口签发",
                                                 匿名: "无需访问凭据",
                                               }[route.authorization] || route.authorization;
                                             row.append(method, path, authorization);
                                             tbody.append(row);
                                           }
                                           table.append(tbody);
                                           section.append(table);
                                           container.append(section);
                                         }
                                         $("empty").hidden = count > 0;
                                         $("summary").textContent =
                                           visibleModules + " 个模块 · " + count + " 个接口";
                                       };
                                       const load = async () => {
                                         $("refresh").disabled = true;
                                         $("message").hidden = true;
                                         try {
                                           const response = await fetch(apiRoot + "/api/modules", {
                                             cache: "no-store",
                                           });
                                           if (!response.ok) throw new Error("无法读取接口目录，请稍后重试。");
                                           const data = await response.json();
                                           if (
                                             !Array.isArray(data) ||
                                             data.some((module) => !Array.isArray(module.endpoints))
                                           )
                                             throw new Error("服务尚未提供接口目录，请确认已运行更新后的 API。");
                                           modules = data;
                                           const selected = $("module-filter").value;
                                           $("module-filter").replaceChildren(element("option", "所有模块"));
                                           $("module-filter").firstChild.value = "";
                                           for (const module of modules) {
                                             const option = element("option", module.name);
                                             option.value = module.name;
                                             $("module-filter").append(option);
                                           }
                                           $("module-filter").value = modules.some(
                                             (module) => module.name === selected,
                                           )
                                             ? selected
                                             : "";
                                           render();
                                         } catch (error) {
                                           $("message").textContent =
                                             error.message || "无法连接服务，请检查网络。";
                                           $("message").hidden = false;
                                           if (!modules.length) $("summary").textContent = "接口目录暂不可用";
                                         } finally {
                                           $("refresh").disabled = false;
                                         }
                                       };
                                       $("search").oninput = render;
                                       $("module-filter").onchange = render;
                                       $("refresh").onclick = load;
                                       load();
                                     </script>
                                   </body>
                                 </html>
                                 """;
}