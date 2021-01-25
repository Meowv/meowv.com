using AntDesign.Pro.Layout;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Shared
{
    public partial class MainLayout
    {
        private MenuDataItem[] MenuData { get; set; }

        protected override async Task OnInitializedAsync()
        {
            await base.OnInitializedAsync();

            MenuData = new MenuDataItem[]
            {
                new MenuDataItem
                {
                    Name = "Dashboard",
                    Key = "dashboard",
                    Path = "/",
                    Icon = "dashboard"
                },
                new MenuDataItem
                {
                    Name = "文章管理",
                    Key = "posts",
                    Path = "/posts",
                    Icon = "read",
                    Children = new MenuDataItem[]
                    {
                        new MenuDataItem
                        {
                            Name = "文章列表",
                            Key = "posts-list",
                            Path = "/posts/list",
                            Icon = "bars"
                        },
                        new MenuDataItem
                        {
                            Name = "新增文章",
                            Key = "posts-add",
                            Path = "/posts/add",
                            Icon = "plus-square"
                        }
                    }
                },
                new MenuDataItem
                {
                    Name = "分类管理",
                    Key = "categories",
                    Path = "/categories",
                    Icon = "switcher",
                    Children = new MenuDataItem[]
                    {
                        new MenuDataItem
                        {
                            Name = "分类列表",
                            Key = "categories-list",
                            Path = "/categories/list",
                            Icon = "bars"
                        },
                        new MenuDataItem
                        {
                            Name = "新增分类",
                            Key = "categories-add",
                            Path = "/categories/add",
                            Icon = "plus-square"
                        }
                    }
                },
                new MenuDataItem
                {
                    Name = "标签管理",
                    Key = "tags",
                    Path = "/tags",
                    Icon = "tags",
                    Children = new MenuDataItem[]
                    {
                        new MenuDataItem
                        {
                            Name = "标签列表",
                            Key = "tags-list",
                            Path = "/tags/list",
                            Icon = "bars"
                        },
                        new MenuDataItem
                        {
                            Name = "新增标签",
                            Key = "tags-add",
                            Path = "/tags/add",
                            Icon = "plus-square"
                        }
                    }
                },
                new MenuDataItem
                {
                    Name = "友链管理",
                    Key = "friendlinks",
                    Path = "/friendlinks",
                    Icon = "link",
                    Children = new MenuDataItem[]
                    {
                        new MenuDataItem
                        {
                            Name = "友链列表",
                            Key = "friendlinks-list",
                            Path = "/friendlinks/list",
                            Icon = "bars"
                        },
                        new MenuDataItem
                        {
                            Name = "新增友链",
                            Key = "friendlinks-add",
                            Path = "/friendlinks/add",
                            Icon = "plus-square"
                        }
                    }
                },
                new MenuDataItem
                {
                    Name = "个性签名",
                    Key = "signatures",
                    Path = "/signatures",
                    Icon = "thunderbolt"
                },
                new MenuDataItem
                {
                    Name = "用户中心",
                    Key = "users",
                    Path = "/users",
                    Icon = "user"
                },
                new MenuDataItem
                {
                    Name = "工具箱",
                    Key = "tools",
                    Path = "/tools",
                    Icon = "tool",
                    Children = new MenuDataItem[]
                    {
                        new MenuDataItem
                        {
                            Name = "CDN刷新",
                            Key = "tools-cdn",
                            Path = "/tools/cdn",
                            Icon = "cloud"
                        },
                        new MenuDataItem
                        {
                            Name = "IP查询",
                            Key = "tools-ip",
                            Path = "/tools/ip2region",
                            Icon = "node-index"
                        }
                    }
                },
                new MenuDataItem
                {
                    Name = "留言板",
                    Key = "messages",
                    Path = "/messages",
                    Icon = "message"
                },
                new MenuDataItem
                {
                    Name = "毒鸡汤",
                    Key = "sayings",
                    Path = "/sayings",
                    Icon = "smile"
                }
            };
        }
    }
}