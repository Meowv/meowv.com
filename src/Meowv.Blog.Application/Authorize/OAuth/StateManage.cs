using System;
using System.Collections.Concurrent;
using Volo.Abp.Guids;

namespace Meowv.Blog.Authorize.OAuth
{
    public class StateManager
    {
        private static readonly ConcurrentDictionary<string, DateTime> states = new ConcurrentDictionary<string, DateTime>();

        private static StateManager _instance = null;

        private static readonly object lockObj = new object();

        public IGuidGenerator GuidGenerator { get; set; }

        protected StateManager() => GuidGenerator = SimpleGuidGenerator.Instance;

        public static StateManager Instance
        {
            get
            {
                lock (lockObj)
                {
                    if (_instance == null)
                    {
                        _instance = new StateManager();
                    }
                    return _instance;
                }
            }
        }

        public string Get()
        {
            var state = GuidGenerator.Create().ToString();
            states.TryAdd(state, DateTime.Now);
            return state;
        }

        public static bool IsExist(string state)
        {
            if (!states.ContainsKey(state)) return false;

            if (DateTime.Now.Subtract(states[state]).TotalMinutes > 3)
            {
                states.TryRemove(state, out _);
                return false;
            }

            return true;
        }

        public static void Remove(string state) => states.TryRemove(state, out _);
    }
}