namespace XiaomiCamera;

internal static class XiaomiSetupPage
{
    internal const string Html = """
                                 <!doctype html>
                                 <html lang="zh-CN">
                                 <head>
                                   <meta charset="utf-8">
                                   <meta name="viewport" content="width=device-width,initial-scale=1">
                                   <title>小米摄像头服务初始化</title>
                                   <style>
                                     body{max-width:34rem;margin:3rem auto;padding:0 1rem;font:16px system-ui;color:#172033}
                                     label{display:block;margin-top:1rem}input,button,select{box-sizing:border-box;width:100%;padding:.65rem;margin-top:.35rem;font:inherit}
                                     button{margin-top:1.5rem;background:#1a73e8;color:white;border:0;border-radius:.4rem;cursor:pointer}
                                     button.secondary{background:#5f6b7a}button.danger{background:#b42318}#access-code{word-break:break-all}
                                     .hint{color:#5f6b7a;font-size:.9rem}.warning{background:#fff4e5;padding:1rem;border-radius:.4rem}
                                   </style>
                                 </head>
                                 <body>
                                   <h1>小米摄像头服务初始化</h1>
                                   <form id="bootstrap-form">
                                     <label>部署密钥<input id="bootstrap-token" type="password" autocomplete="off" required></label>
                                     <p class="hint">此密钥只保留在当前页面内存中，用于初始化、账号重绑和授权码轮换。</p>
                                     <button>继续</button>
                                   </form>

                                   <section id="setup" hidden>
                                     <p id="message" aria-live="polite">正在检查已保存的登录会话…</p>
                                     <section id="access-code-section" class="warning" hidden>
                                       <strong>请立即保存授权码</strong>
                                       <p>它仅在当前页面显示一次，遗失后只能使用部署密钥重新生成。</p>
                                       <input id="access-code" readonly aria-label="授权码">
                                       <button id="copy-access-code" type="button" class="secondary">复制授权码</button>
                                     </section>
                                     <button id="rotate-access-code" type="button" class="secondary" hidden>重新生成授权码</button>
                                     <button id="reset-session" type="button" class="danger" hidden>切换账号 / 重新登录</button>
                                     <form id="login" hidden>
                                       <label>小米账号<input name="username" autocomplete="username" required></label>
                                       <label>密码<input type="password" name="password" autocomplete="current-password" required></label>
                                       <label>设备所在区域<select name="region"><option value="cn">中国大陆</option><option value="de">欧洲</option><option value="us">美国</option><option value="sg">新加坡</option><option value="ru">俄罗斯</option><option value="i2">印度</option></select></label>
                                       <button>登录</button>
                                     </form>
                                     <form id="verify" hidden>
                                       <label>验证码<input name="code" inputmode="numeric" autocomplete="one-time-code" required></label>
                                       <button>提交验证码</button>
                                     </form>
                                   </section>
                                   <script>
                                     const bootstrapForm=document.querySelector('#bootstrap-form'),bootstrapToken=document.querySelector('#bootstrap-token'),setup=document.querySelector('#setup');
                                     const login=document.querySelector('#login'),verify=document.querySelector('#verify'),message=document.querySelector('#message'),reset=document.querySelector('#reset-session');
                                     const rotate=document.querySelector('#rotate-access-code'),accessCodeSection=document.querySelector('#access-code-section'),accessCode=document.querySelector('#access-code'),copy=document.querySelector('#copy-access-code');
                                     let attemptId='';
                                     const request=(url,init={})=>fetch(url,{...init,headers:{'X-Xiaomi-Bootstrap-Token':bootstrapToken.value.trim(),...(init.headers||{})}});
                                     const showLogin=text=>{message.textContent=text;login.hidden=false;verify.hidden=true;reset.hidden=true;rotate.hidden=true;};
                                     const showSaved=()=>{message.textContent='已保存可用的小米登录会话。';login.hidden=true;verify.hidden=true;reset.hidden=false;rotate.hidden=false;};
                                     const showAccessCode=code=>{if(!code)return;accessCode.value=code;accessCodeSection.hidden=false;};
                                     const handle=data=>{if(data.status==='verification_required'){attemptId=data.attemptId;message.textContent=`请填写发送到 ${data.verificationDestination||'已绑定账号'} 的${data.verificationKind}。`;login.hidden=true;verify.hidden=false;return}if(data.status==='completed'){showSaved();showAccessCode(data.accessCode);return}showLogin('没有可用的已保存会话，请登录。');};
                                     const read=async response=>{const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||'操作失败。');return data;};
                                     const load=async()=>{try{handle(await read(await request('/api/setup/xiaomi/session')))}catch(error){message.textContent=error.message||'无法检查已保存会话。';}};
                                     bootstrapForm.onsubmit=async event=>{event.preventDefault();setup.hidden=false;message.textContent='正在检查已保存的登录会话…';await load();};
                                     login.onsubmit=async event=>{event.preventDefault();message.textContent='正在登录…';try{const form=new FormData(login);handle(await read(await request('/api/setup/xiaomi/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(form))})))}catch(error){message.textContent=error.message||'登录失败。'}};
                                     verify.onsubmit=async event=>{event.preventDefault();message.textContent='正在完成验证…';try{const code=new FormData(verify).get('code');handle(await read(await request(`/api/setup/xiaomi/${attemptId}/verify`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})})))}catch(error){message.textContent=error.message||'验证失败。'}};
                                     reset.onclick=async()=>{try{await read(await request('/api/setup/xiaomi/session',{method:'DELETE'}));login.reset();accessCodeSection.hidden=true;showLogin('已移除保存的会话，请使用要切换的账号登录。')}catch(error){message.textContent=error.message||'无法移除会话。'}};
                                     rotate.onclick=async()=>{if(!confirm('重新生成后，旧授权码会立即失效。确定继续吗？'))return;try{const data=await read(await request('/api/setup/xiaomi/access-code/rotate',{method:'POST'}));showAccessCode(data.accessCode);message.textContent='已生成新授权码，旧授权码已失效。'}catch(error){message.textContent=error.message||'无法重新生成授权码。'}};
                                     copy.onclick=async()=>{try{await navigator.clipboard.writeText(accessCode.value);copy.textContent='已复制';setTimeout(()=>copy.textContent='复制授权码',1500)}catch{message.textContent='无法自动复制，请手动复制授权码。'}};
                                   </script>
                                 </body>
                                 </html>
                                 """;
}