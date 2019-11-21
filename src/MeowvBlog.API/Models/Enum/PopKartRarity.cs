using System.ComponentModel;

namespace MeowvBlog.API.Models.Enum
{
    public enum PopKartRarity
    {
        [Description("传说")]
        传说 = 0,

        [Description("史诗")]
        史诗 = 1,

        [Description("稀有")]
        稀有 = 2,

        [Description("普通")]
        普通 = 3
    }
}