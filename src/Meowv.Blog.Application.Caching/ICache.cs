using System;

namespace Meowv.Blog.Application.Caching
{
    public interface ICache
    {
        /// <summary>
        /// 添加
        /// </summary>
        /// <param name="key">键</param>
        /// <param name="value">值</param>
        /// <param name="seconds">缓存时间（秒）</param>
        /// <returns></returns>
        bool Add(string key, string value, int seconds = 0);

        /// <summary>
        /// 添加
        /// </summary>
        /// <param name="key">键</param>
        /// <param name="value">值</param>
        /// <param name="seconds">缓存时间（秒）</param>
        /// <returns></returns>
        bool Add<T>(string key, T value, int seconds = 0) where T : class, new();

        /// <summary>
        /// 存
        /// </summary>
        /// <param name="key">键</param>
        /// <param name="value">值</param>
        /// <param name="seconds">缓存时间（秒）</param>
        /// <returns></returns>
        bool Set(string key, string value, int seconds = 0);

        /// <summary>
        /// 存
        /// </summary>
        /// <param name="key">键</param>
        /// <param name="value">值</param>
        /// <param name="seconds">缓存时间（秒）</param>
        /// <returns></returns>
        bool Set<T>(string key, T value, int seconds = 0) where T : class, new();

        /// <summary>
        /// 取
        /// </summary>
        /// <param name="key">键</param>
        /// <returns></returns>
        string Get(string key);

        /// <summary>
        /// 取
        /// </summary>
        /// <param name="key">键</param>
        /// <returns></returns>
        T Get<T>(string key) where T : class;

        /// <summary>
        /// 取
        /// </summary>
        /// <param name="key">键</param>
        /// <param name="aquire">委托</param>
        /// <param name="seconds">缓存时间（秒）</param>
        /// <returns></returns>
        string GetOrAdd(string key, Func<string> aquire, int seconds = 0);

        /// <summary>
        /// 取
        /// </summary>
        /// <param name="key">键</param>
        /// <param name="aquire">委托</param>
        /// <param name="seconds">缓存时间（秒）</param>
        /// <returns></returns>
        T GetOrAdd<T>(string key, Func<T> aquire, int seconds = 0) where T : class, new();

        /// <summary>
        /// 取
        /// </summary>
        /// <param name="key">键</param>
        /// <param name="aquire">委托</param>
        /// <param name="seconds">缓存时间（秒）</param>
        /// <returns></returns>
        string GetOrSet(string key, Func<string> aquire, int seconds = 0);

        /// <summary>
        /// 取
        /// </summary>
        /// <param name="key">键</param>
        /// <param name="aquire">委托</param>
        /// <param name="seconds">缓存时间（秒）</param>
        /// <returns></returns>
        T GetOrSet<T>(string key, Func<T> aquire, int seconds = 0) where T : class, new();

        /// <summary>
        /// 是否存在
        /// </summary>
        /// <param name="key">键</param>
        /// <returns></returns>
        bool Contains(string key);

        /// <summary>
        /// 删除
        /// </summary>
        /// <param name="key">键</param>
        /// <returns></returns>
        bool Remove(string key);
    }
}