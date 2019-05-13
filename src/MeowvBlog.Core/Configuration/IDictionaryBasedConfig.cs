using System;

namespace MeowvBlog.Core.Configuration
{
    public interface IDictionaryBasedConfig
    {
        void Set<T>(string name, T value);

        object Get(string name);

        T Get<T>(string name);

        object Get(string name, object defaultValue);

        T Get<T>(string name, T defaultValue);

        T GetOrCreate<T>(string name, Func<T> creator);
    }
}