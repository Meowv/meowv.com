using System;
using System.Collections.Generic;

namespace MeowvBlog.Core.Dependency
{
    public class ScopedIocResolver : IScopedIocResolver
    {
        private readonly IIocResolver _iocResolver;
        private readonly List<object> _resolvedObjects;

        public ScopedIocResolver(IIocResolver iocResolver)
        {
            _iocResolver = iocResolver;
            _resolvedObjects = new List<object>();
        }

        public T Resolve<T>()
        {
            return Resolve<T>(typeof(T));
        }

        public T Resolve<T>(Type type)
        {
            return (T)Resolve(type);
        }

        public void Release(object obj)
        {
            _resolvedObjects.Remove(obj);
            _iocResolver.Release(obj);
        }

        public bool IsRegistered(Type type)
        {
            return _iocResolver.IsRegistered(type);
        }

        public bool IsRegistered<T>()
        {
            return IsRegistered(typeof(T));
        }

        public void Dispose()
        {
            _resolvedObjects.ForEach(_iocResolver.Release);
        }

        public object Resolve(Type type)
        {
            return Resolve(type);
        }

        public T[] ResolveAll<T>()
        {
            return ResolveAll<T>();
        }

        public object[] ResolveAll(Type type)
        {
            return ResolveAll(type);
        }
    }
}