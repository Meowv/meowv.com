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
            };
        }
    }
}