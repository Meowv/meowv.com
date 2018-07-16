using System;
using System.Collections.Generic;
using System.Linq;

namespace Meowv.Processor.Cache
{
    public class CacheObject<T>
    {
        private static readonly Dictionary<string, CacheData<T>> list = new Dictionary<string, CacheData<T>>();

        public static object lockObject = new object();

        private string _key;

        private TimeSpan _timeSpan;

        public CacheObject(string key, TimeSpan timeSpan)
        {
            _key = key;
            _timeSpan = timeSpan;
        }

        public bool AddData(T data)
        {
            lock (lockObject)
            {
                if (list.ContainsKey(_key))
                {
                    return false;
                }
                list.Add(_key, new CacheData<T>
                {
                    Data = data,
                    ExpirationTime = DateTime.Now.Add(_timeSpan)
                });
                return true;
            }
        }

        public bool ModifyData(string key, T data)
        {
            var array = Enumerable.ToArray(
                Enumerable.Select(
                    Enumerable.Where(list, (KeyValuePair<string, CacheData<T>> t)
                    => t.Value.ExpirationTime
                    <= DateTime.Now), (KeyValuePair<string, CacheData<T>> t)
                    => t.Key));
            lock (lockObject)
            {
                var _array = array;
                foreach (var item in _array)
                {
                    list.Remove(item);
                }
                if (!list.ContainsKey(key))
                {
                    return false;
                }
                list[key].Data = data;
                return true;
            }
        }

        public CacheData<T> GetData()
        {
            var array = Enumerable.ToArray(
                Enumerable.Select(
                    Enumerable.Where(list, (KeyValuePair<string, CacheData<T>> t)
                    => t.Value.ExpirationTime
                    <= DateTime.Now), (KeyValuePair<string, CacheData<T>> t)
                    => t.Key));
            lock (lockObject)
            {
                var _array = array;
                foreach (var item in _array)
                {
                    list.Remove(item);
                }
                if (list.ContainsKey(_key))
                {
                    return list[_key];
                }
                return null;
            }
        }
    }
}
