using MeowvBlog.Localization;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.Localization;

namespace MeowvBlog.Permissions
{
    public class MeowvBlogPermissionDefinitionProvider : PermissionDefinitionProvider
    {
        public override void Define(IPermissionDefinitionContext context)
        {
            var myGroup = context.AddGroup(MeowvBlogPermissions.GroupName);

            //Define your own permissions here. Example:
            //myGroup.AddPermission(MeowvBlogPermissions.MyPermission1, L("Permission:MyPermission1"));
        }

        private static LocalizableString L(string name)
        {
            return LocalizableString.Create<MeowvBlogResource>(name);
        }
    }
}
