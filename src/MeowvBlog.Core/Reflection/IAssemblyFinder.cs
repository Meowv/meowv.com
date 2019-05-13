using System;
using System.Collections.Generic;
using System.Reflection;
using System.Text;

namespace MeowvBlog.Core.Reflection
{
    public interface IAssemblyFinder
    {
        List<Assembly> GetAllAssemblies();
    }
}