using Volo.Abp.Identity;
using Volo.Abp.Modularity;
using Volo.Abp.VirtualFileSystem;

namespace MeowvBlog.Domain.Shared
{
    [DependsOn(
        typeof(AbpIdentityDomainSharedModule)
    )]
    public class MeowvBlogDomainSharedModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context)
        {
            Configure<AbpVirtualFileSystemOptions>(options =>
            {
                options.FileSets.AddEmbedded<MeowvBlogDomainSharedModule>("Meowv");
            });
        }
    }
}