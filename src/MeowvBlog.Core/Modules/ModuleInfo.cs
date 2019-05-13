using System;
using System.Collections.Generic;
using System.Reflection;

namespace MeowvBlog.Core.Modules
{
    public class ModuleInfo
    {
        public Assembly Assembly
        {
            get;
        }

        public Type Type
        {
            get;
        }

        public Module Instance
        {
            get;
        }

        public List<ModuleInfo> Dependencies
        {
            get;
        }

        public ModuleInfo(Type type, Module instance)
        {
            Type = type;
            Instance = instance;
            Assembly = Type.GetTypeInfo().Assembly;
            Dependencies = new List<ModuleInfo>();
        }

        public override string ToString()
        {
            return Type.AssemblyQualifiedName ?? Type.FullName;
        }
    }
}
