using MeowvBlog.Core.Dependency;
using System;

namespace MeowvBlog.Core.Configuration.Startup
{
    public interface IStartupConfiguration : IDictionaryBasedConfig
    {
        IIocManager IocManager
        {
            get;
        }

        void ReplaceService(Type type, Action replaceAction);

        T Get<T>();
    }
}