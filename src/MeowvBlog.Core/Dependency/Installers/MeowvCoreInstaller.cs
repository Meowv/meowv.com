using Castle.MicroKernel.Registration;
using Castle.MicroKernel.SubSystems.Configuration;
using Castle.Windsor;
using MeowvBlog.Core.Configuration.Startup;
using MeowvBlog.Core.Modules;
using MeowvBlog.Core.Reflection;

namespace MeowvBlog.Core.Dependency.Installers
{
    internal class MeowvCoreInstaller : IWindsorInstaller
    {
        public void Install(IWindsorContainer container, IConfigurationStore store)
        {
            container.Register((IRegistration[])new IRegistration[4]
        {
            Component.For<IStartupConfiguration, StartupConfiguration>().ImplementedBy<StartupConfiguration>().LifestyleSingleton(),

            Component.For<IModuleManager, ModuleManager>().ImplementedBy<ModuleManager>().LifestyleSingleton(),
            Component.For<IAssemblyFinder, AppDomainAssemblyFinder>().ImplementedBy<AppDomainAssemblyFinder>().LifestyleSingleton(),

            Component.For<ITypeFinder, TypeFinder>().ImplementedBy<TypeFinder>().LifestyleSingleton(),
            
        });
        }
    }
}