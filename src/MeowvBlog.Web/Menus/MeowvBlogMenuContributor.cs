using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Localization;
using MeowvBlog.Localization;
using MeowvBlog.MultiTenancy;
using Volo.Abp.TenantManagement.Web.Navigation;
using Volo.Abp.UI.Navigation;

namespace MeowvBlog.Web.Menus
{
    public class MeowvBlogMenuContributor : IMenuContributor
    {
        public async Task ConfigureMenuAsync(MenuConfigurationContext context)
        {
            if (context.Menu.Name == StandardMenus.Main)
            {
                await ConfigureMainMenuAsync(context);
            }
        }

        private async Task ConfigureMainMenuAsync(MenuConfigurationContext context)
        {
            if (!MultiTenancyConsts.IsEnabled)
            {
                var administration = context.Menu.GetAdministration();
                administration.TryRemoveMenuItem(TenantManagementMenuNames.GroupName);
            }

            var l = context.ServiceProvider.GetRequiredService<IStringLocalizer<MeowvBlogResource>>();

            context.Menu.Items.Insert(0, new ApplicationMenuItem("MeowvBlog.Home", l["Menu:Home"], "/"));
        }
    }
}
