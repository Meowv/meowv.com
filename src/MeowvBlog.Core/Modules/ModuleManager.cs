using Castle.Core.Logging;
using MeowvBlog.Core.Configuration.Startup;
using MeowvBlog.Core.Dependency;
using System.Collections.Immutable;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace MeowvBlog.Core.Modules
{
    public class ModuleManager : IModuleManager
    {
        private ModuleCollection _modules;

        private readonly IIocManager _iocManager;

        private readonly IStartupConfiguration _startupConfiguration;

        public ModuleInfo StartupModule
        {
            get;
            private set;
        }

        public IReadOnlyList<ModuleInfo> Modules => _modules.ToImmutableList();

        public ILogger Logger
        {
            get;
            set;
        }

        public ModuleManager(IIocManager iocManager, IStartupConfiguration startupConfiguration)
        {
            _iocManager = iocManager;
            _startupConfiguration = startupConfiguration;
            Logger = NullLogger.Instance;
        }

        public virtual void Initialize(Type startupModule)
        {
            _modules = new ModuleCollection(startupModule);
            LoadAllModules();
        }

        public virtual void StartModules()
        {
            List<ModuleInfo> sortedModuleListByDependency = _modules.GetSortedModuleListByDependency();
            if (sortedModuleListByDependency != null)
            {
                sortedModuleListByDependency.ForEach(delegate (ModuleInfo module)
                {
                    module.Instance.PreInitialize();
                });
                sortedModuleListByDependency.ForEach(delegate (ModuleInfo module)
                {
                    module.Instance.Initialize();
                });
                sortedModuleListByDependency.ForEach(delegate (ModuleInfo module)
                {
                    module.Instance.PostInitialize();
                });
            }
        }

        public virtual void ShutdownModules()
        {
            Logger.Debug("Shutting down has been started");
            List<ModuleInfo> sortedModuleListByDependency = _modules.GetSortedModuleListByDependency();
            sortedModuleListByDependency.Reverse();
            sortedModuleListByDependency.ForEach(delegate (ModuleInfo sm)
            {
                sm.Instance.Shutdown();
            });
            Logger.Debug("Shutting down completed.");
        }

        private void LoadAllModules()
        {
            Logger.Debug("Loading UPrime modules...");
            List<Type> list = FindAllModuleTypes().Distinct().ToList();
            Logger.Debug("Found " + list.Count + " UPrime modules in total.");
            RegisterModules(list);
            CreateModules(list);
            _modules.EnsureKernelModuleToBeFirst();
            _modules.EnsureStartupModuleToBeLast();
            SetDependencies();
            Logger.DebugFormat("{0} modules loaded.", new object[1]
            {
            _modules.Count
            });
        }

        private List<Type> FindAllModuleTypes()
        {
            return Module.FindDependedModuleTypesRecursivelyIncludingGivenModule(_modules.StartupModuleType);
        }

        private void CreateModules(ICollection<Type> moduleTypes)
        {
            foreach (Type moduleType in moduleTypes)
            {
                Module module = _iocManager.Resolve(moduleType) as Module;
                if (module == null)
                {
                    throw new BaseException("This type is not an ABP module: " + moduleType.AssemblyQualifiedName);
                }
                module.IocManager = _iocManager;
                module.Configuration = _startupConfiguration;
                ModuleInfo uPrimeModuleInfo = new ModuleInfo(moduleType, module);
                _modules.Add(uPrimeModuleInfo);
                if (moduleType == _modules.StartupModuleType)
                {
                    StartupModule = uPrimeModuleInfo;
                }
                Logger.DebugFormat("Loaded module: " + moduleType.AssemblyQualifiedName, Array.Empty<object>());
            }
        }

        private void RegisterModules(ICollection<Type> moduleTypes)
        {
            foreach (Type moduleType in moduleTypes)
            {
                _iocManager.RegisterIfNot(moduleType);
            }
        }

        private void SetDependencies()
        {
            foreach (ModuleInfo module in _modules)
            {
                module.Dependencies.Clear();
                foreach (Type dependedModuleType in Module.FindDependedModuleTypes(module.Type))
                {
                    ModuleInfo uPrimeModuleInfo = _modules.FirstOrDefault((ModuleInfo m) => m.Type == dependedModuleType);
                    if (uPrimeModuleInfo == null)
                    {
                        throw new BaseException("Could not find a depended module " + dependedModuleType.AssemblyQualifiedName + " for " + module.Type.AssemblyQualifiedName);
                    }
                    if (module.Dependencies.FirstOrDefault((ModuleInfo dm) => dm.Type == dependedModuleType) == null)
                    {
                        module.Dependencies.Add(uPrimeModuleInfo);
                    }
                }
            }
        }
    }
}
