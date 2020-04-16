using Volo.Abp.Settings;

namespace MeowvBlog.Settings
{
    public class MeowvBlogSettingDefinitionProvider : SettingDefinitionProvider
    {
        public override void Define(ISettingDefinitionContext context)
        {
            //Define your own settings here. Example:
            //context.Add(new SettingDefinition(MeowvBlogSettings.MySetting1));
        }
    }
}
