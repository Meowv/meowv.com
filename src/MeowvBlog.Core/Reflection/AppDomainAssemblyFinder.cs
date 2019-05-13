using MeowvBlog.Core.Reflection;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

public class AppDomainAssemblyFinder : IAssemblyFinder
{
    public static AppDomainAssemblyFinder Instance
    {
        get;
        private set;
    }

    static AppDomainAssemblyFinder()
    {
        Instance = new AppDomainAssemblyFinder();
    }

    public List<Assembly> GetAllAssemblies()
    {
        return AppDomain.CurrentDomain.GetAssemblies().ToList();
    }
}