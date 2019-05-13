using System;
using System.Collections.Generic;

namespace MeowvBlog.Core.Configuration
{
    public class DictionaryBasedConfig : IDictionaryBasedConfig
    {
        protected Dictionary<string, object> CustomSettings
        {
            get;
            private set;
        }

        public object this[string name]
        {
            get
            {
                return GetOrDefault(CustomSettings, name);
            }
            set
            {
                CustomSettings[name] = value;
            }
        }

        protected DictionaryBasedConfig()
        {
            CustomSettings = new Dictionary<string, object>();
        }

        public T Get<T>(string name)
        {
            object obj = this[name];
            return (obj == null) ? default(T) : ((T)Convert.ChangeType(obj, typeof(T)));
        }

        public void Set<T>(string name, T value)
        {
            this[name] = value;
        }

        public object Get(string name)
        {
            return Get(name, null);
        }

        public object Get(string name, object defaultValue)
        {
            object obj = this[name];
            if (obj == null)
            {
                return defaultValue;
            }
            return this[name];
        }

        public T Get<T>(string name, T defaultValue)
        {
            return (T)Get(name, (object)defaultValue);
        }

        public T GetOrCreate<T>(string name, Func<T> creator)
        {
            object obj = Get(name);
            if (obj == null)
            {
                obj = creator();
                Set(name, obj);
            }
            return (T)obj;
        }

        public TValue GetOrDefault<TKey, TValue>(IDictionary<TKey, TValue> dictionary, TKey key)
        {
            TValue obj;
            return dictionary.TryGetValue(key, out obj) ? obj : default(TValue);
        }
    }
}