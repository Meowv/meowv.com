using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace MeowvBlog.Core.Modules
{
    public class ModuleCollection : List<ModuleInfo>
    {
        public Type StartupModuleType
        {
            get;
        }

        public ModuleCollection(Type startupModuleType)
        {
            StartupModuleType = startupModuleType;
        }

        public TModule GetModule<TModule>() where TModule : Module
        {
            ModuleInfo uPrimeModuleInfo = this.FirstOrDefault((ModuleInfo x) => x.Type == typeof(TModule));
            if (uPrimeModuleInfo == null)
            {
                throw new BaseException("Can not find module for " + typeof(TModule).FullName);
            }
            return (TModule)uPrimeModuleInfo.Instance;
        }

        public List<ModuleInfo> GetSortedModuleListByDependency()
        {
            return SortByDependencies<ModuleInfo>((IEnumerable<ModuleInfo>)this, (Func<ModuleInfo, IEnumerable<ModuleInfo>>)((ModuleInfo x) => x.Dependencies));
        }

        public void EnsureStartupModuleToBeLast()
        {
            EnsureStartupModuleToBeLast(this, StartupModuleType);
        }

        public static void EnsureStartupModuleToBeLast(List<ModuleInfo> modules, Type startupModuleType)
        {
            int num = modules.FindIndex((ModuleInfo x) => x.Type == startupModuleType);
            if (num < modules.Count - 1)
            {
                ModuleInfo item = modules[num];
                modules.RemoveAt(num);
                modules.Add(item);
            }
        }

        public void EnsureKernelModuleToBeFirst()
        {
            EnsureKernelModuleToBeFirst(this);
        }

        public static void EnsureKernelModuleToBeFirst(List<ModuleInfo> modules)
        {
            var kernelModuleIndex = modules.FindIndex(m => m.Type == typeof(KernelModule));
            if (kernelModuleIndex <= 0)
            {
                //It's already the first!
                return;
            }

            var kernelModule = modules[kernelModuleIndex];
            modules.RemoveAt(kernelModuleIndex);
            modules.Insert(0, kernelModule);
        }

        private List<T> SortByDependencies<T>(IEnumerable<T> source, Func<T, IEnumerable<T>> getDependencies)
        {
            var sorted = new List<T>();
            var visited = new Dictionary<T, bool>();

            foreach (var item in source)
            {
                SortByDependenciesVisit(item, getDependencies, sorted, visited);
            }

            return sorted;
        }

        private static void SortByDependenciesVisit<T>(T item, Func<T, IEnumerable<T>> getDependencies, List<T> sorted, Dictionary<T, bool> visited)
        {
            bool inProcess;
            var alreadyVisited = visited.TryGetValue(item, out inProcess);

            if (alreadyVisited)
            {
                if (inProcess)
                {
                    throw new ArgumentException("Cyclic dependency found! Item: " + item);
                }
            }
            else
            {
                visited[item] = true;

                var dependencies = getDependencies(item);
                if (dependencies != null)
                {
                    foreach (var dependency in dependencies)
                    {
                        SortByDependenciesVisit(dependency, getDependencies, sorted, visited);
                    }
                }

                visited[item] = false;
                sorted.Add(item);
            }
        }
    }
}
