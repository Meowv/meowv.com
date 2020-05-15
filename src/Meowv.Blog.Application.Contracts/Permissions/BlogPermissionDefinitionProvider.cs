using Meowv.Blog.Localization;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.Localization;

namespace Meowv.Blog.Permissions
{
    public class BlogPermissionDefinitionProvider : PermissionDefinitionProvider
    {
        public override void Define(IPermissionDefinitionContext context)
        {
            var myGroup = context.AddGroup(BlogPermissions.GroupName);

            //Define your own permissions here. Example:
            //myGroup.AddPermission(BlogPermissions.MyPermission1, L("Permission:MyPermission1"));
        }

        private static LocalizableString L(string name)
        {
            return LocalizableString.Create<BlogResource>(name);
        }
    }
}
