using MeowvBlog.Core.Dependency;
using System;
using System.Collections.Generic;

namespace MeowvBlog.Core.Configuration.Startup
{
    public class StartupConfiguration : DictionaryBasedConfig, IStartupConfiguration, IDictionaryBasedConfig
    {
        public IIocManager IocManager
        {
            get;
            private set;
        }

        public Dictionary<Type, Action> ServiceReplaceActions
        {
            get;
            private set;
        }

        public StartupConfiguration(IIocManager iocManager)
        {
            IocManager = iocManager;
        }

        public void Initialize()
        {
            ServiceReplaceActions = new Dictionary<Type, Action>();
        }

        public void ReplaceService(Type type, Action replaceAction)
        {
            ServiceReplaceActions[type] = replaceAction;
        }

        public T Get<T>()
        {
            return GetOrCreate(typeof(T).FullName, () => IocManager.Resolve<T>());
        }
    }
}