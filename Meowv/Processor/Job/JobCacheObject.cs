using System;
using System.Collections.Generic;
using System.Linq;

namespace Meowv.Processor.Job
{
    public class JobCacheObject<T>
    {
        private static readonly Dictionary<string, JobCacheData<T>> list = new Dictionary<string, JobCacheData<T>>();

        public static object lockObject = new object();

        private string _key;

        private TimeSpan _timeSpan;

        public JobCacheObject(string key, TimeSpan timeSpan)
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
                list.Add(_key, new JobCacheData<T>
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
                    Enumerable.Where(list, (KeyValuePair<string, JobCacheData<T>> t)
                    => t.Value.ExpirationTime
                    <= DateTime.Now), (KeyValuePair<string, JobCacheData<T>> t)
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

        public JobCacheData<T> GetData()
        {
            var array = Enumerable.ToArray(
                Enumerable.Select(
                    Enumerable.Where(list, (KeyValuePair<string, JobCacheData<T>> t)
                    => t.Value.ExpirationTime
                    <= DateTime.Now), (KeyValuePair<string, JobCacheData<T>> t)
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