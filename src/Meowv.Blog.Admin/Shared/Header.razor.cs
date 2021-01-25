using AntDesign;
using Microsoft.AspNetCore.Components;

namespace Meowv.Blog.Admin.Shared
{
    public partial class Header
    {
        [Inject]
        NavigationManager NavigationManager { get; set; }

        public string Avatar { get; set; } = "https://static.meowv.com/images/avatar.jpg";

        public string Name { get; set; } = "阿星Plus";

        public void OnClickCallback(MenuItem item)
        {
            switch (item.Key)
            {
                case "user":
                    NavigationManager.NavigateTo("/users");
                    break;
                case "logout":
                    break;
            }
        }
    }
}