using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using System;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

namespace Meowv.Blog.BlazorApp.Commons
{
    public class Common
    {
        private readonly IJSRuntime _jsRuntime;

        private readonly NavigationManager _navigationManager;

        public Common(IJSRuntime jsRuntime, NavigationManager navigationManager)
        {
            _jsRuntime = jsRuntime;

            _navigationManager = navigationManager;
        }

        /// <summary>
        /// 执行无返回值方法
        /// </summary>
        /// <param name="identifier"></param>
        /// <param name="args"></param>
        /// <returns></returns>
        public async ValueTask InvokeAsync(string identifier, params object[] args)
        {
            await _jsRuntime.InvokeVoidAsync(identifier, args);
        }

        /// <summary>
        /// 执行带返回值的方法
        /// </summary>
        /// <typeparam name="TValue"></typeparam>
        /// <param name="identifier"></param>
        /// <param name="args"></param>
        /// <returns></returns>
        public async ValueTask<TValue> InvokeAsync<TValue>(string identifier, params object[] args)
        {
            return await _jsRuntime.InvokeAsync<TValue>(identifier, args);
        }

        /// <summary>
        /// 设置标题
        /// </summary>
        /// <param name="title"></param>
        /// <returns></returns>
        public async Task SetTitleAsync(string title = null)
        {
            if (string.IsNullOrEmpty(title))
            {
                await InvokeAsync("window.func.setTitle", $"🤣阿星Plus⭐⭐⭐");
            }
            else
            {
                await InvokeAsync("window.func.setTitle", $"🤣{title} - 阿星Plus⭐⭐⭐");
            }
        }

        /// <summary>
        /// 设置localStorage
        /// </summary>
        /// <param name="name"></param>
        /// <param name="value"></param>
        /// <returns></returns>
        public async Task SetStorageAsync(string name, string value)
        {
            await InvokeAsync("window.func.setStorage", name, value);
        }

        /// <summary>
        /// 获取localStorage
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        public async Task<string> GetStorageAsync(string name)
        {
            return await InvokeAsync<string>("window.func.getStorage", name);
        }

        /// <summary>
        /// 切换编辑器主题
        /// </summary>
        /// <param name="currentTheme"></param>
        /// <returns></returns>
        public async Task SwitchEditorTheme(string currentTheme)
        {
            var editorTheme = currentTheme == "Light" ? "default" : "dark";

            await SetStorageAsync("editorTheme", editorTheme);

            await InvokeAsync("window.func.switchEditorTheme");
        }

        /// <summary>
        /// 跳转指定URL
        /// </summary>
        /// <param name="uri"></param>
        /// <param name="forceLoad">true，绕过路由刷新页面</param>
        /// <returns></returns>
        public async Task NavigateTo(string url, bool forceLoad = false)
        {
            _navigationManager.NavigateTo(url, forceLoad);

            await Task.CompletedTask;
        }

        /// <summary>
        /// 获取当前URI对象
        /// </summary>
        /// <returns></returns>
        public async Task<Uri> CurrentUri()
        {
            var uri = _navigationManager.ToAbsoluteUri(_navigationManager.Uri);

            return await Task.FromResult(uri);
        }

        /// <summary>
        /// 获取当前URI路径
        /// </summary>
        /// <returns></returns>
        public string Uri()
        {
            return _navigationManager.Uri;
        }

        /// <summary>
        /// 将字符串转换为MD5
        /// </summary>
        /// <param name="inputStr"></param>
        /// <returns></returns>
        public string ToMd5(string inputStr)
        {
            using var md5 = MD5.Create();
            var result = md5.ComputeHash(Encoding.Default.GetBytes(inputStr));
            return BitConverter.ToString(result).Replace("-", "").ToLower();
        }
    }
}