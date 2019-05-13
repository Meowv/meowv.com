using System;
using System.Collections.Generic;
using System.Reflection;

namespace MeowvBlog.Core.Reflection
{
    public interface ITypeFinder
    {
        Type[] Find(Func<Type, bool> predicate);

        Type[] FindAll();
    }
}