using Castle.Core.Logging;
using MeowvBlog.Core.Configuration.Startup;
using MeowvBlog.Core.Dependency;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace MeowvBlog.Core.Modules
{
    public abstract class Module
    {
        protected internal IIocManager IocManager
        {
            get;
            internal set;
        }

        protected internal IStartupConfiguration Configuration
        {
            get;
            internal set;
        }

        public ILogger Logger
        {
            get;
            set;
        }

        protected Module()
        {
            Logger = NullLogger.Instance;
        }

        public virtual void PreInitialize()
        {
        }

        public virtual void Initialize()
        {
        }

        public virtual void PostInitialize()
        {
        }

        public virtual void Shutdown()
        {
        }

        public virtual Assembly[] GetAdditionalAssemblies()
        {
            return new Assembly[0];
        }

        public static bool IsUpModule(Type type)
        {
            TypeInfo typeInfo = type.GetTypeInfo();
            return typeInfo.IsClass && !typeInfo.IsAbstract && !typeInfo.IsGenericType && typeof(Module).IsAssignableFrom(type);
        }

        public static List<Type> FindDependedModuleTypesRecursivelyIncludingGivenModule(Type moduleType)
        {
            var list = new List<Type>();
            AddModuleAndDependenciesRecursively(list, moduleType);
            AddIfNotContains(list, typeof(KernelModule));
            return list;
        }

        public  static bool AddIfNotContains<T>(ICollection<T> source, T item)
        {
            if (source == null)
            {
                throw new ArgumentNullException("source");
            }

            if (source.Contains(item))
            {
                return false;
            }

            source.Add(item);
            return true;
        }

        public static List<Type> FindDependedModuleTypes(Type moduleType)
        {
            if (!IsUpModule(moduleType))
            {
                throw new BaseException("This type is not an UPrime module: " + moduleType.AssemblyQualifiedName);
            }
            List<Type> list = new List<Type>();
            if (moduleType.GetTypeInfo().IsDefined(typeof(DependsOnAttribute), inherit: true))
            {
                IEnumerable<DependsOnAttribute> enumerable = moduleType.GetTypeInfo().GetCustomAttributes(typeof(DependsOnAttribute), inherit: true).Cast<DependsOnAttribute>();
                foreach (DependsOnAttribute item2 in enumerable)
                {
                    Type[] dependedModuleTypes = item2.DependedModuleTypes;
                    foreach (Type item in dependedModuleTypes)
                    {
                        list.Add(item);
                    }
                }
            }
            return list;
        }

        private static void AddModuleAndDependenciesRecursively(List<Type> modules, Type module)
        {
            if (!IsUpModule(module))
            {
                throw new BaseException("This type is not an UPrime module: " + module.AssemblyQualifiedName);
            }
            if (!modules.Contains(module))
            {
                modules.Add(module);
                List<Type> list = FindDependedModuleTypes(module);
                foreach (Type item in list)
                {
                    AddModuleAndDependenciesRecursively(modules, item);
                }
            }
        }
    }
}
