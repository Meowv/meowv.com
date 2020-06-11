using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using System;
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
        /// 后退
        /// </summary>
        /// <returns></returns>
        public async Task BaskAsync()
        {
            await InvokeAsync("window.history.back");
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
    }
}