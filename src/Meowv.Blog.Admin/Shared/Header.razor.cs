using AntDesign;
using Meowv.Blog.Admin.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Shared
{
    public partial class Header
    {
        [Inject]
        public AuthenticationStateProvider AuthenticationStateProvider { get; set; }

        public async Task OnClickCallbackAsync(MenuItem item)
        {
            switch (item.Key)
            {
                case "user":
                    NavigationManager.NavigateTo("/users");
                    break;
                case "logout":
                    {
                        var service = AuthenticationStateProvider as OAuthService;
                        await service.LogoutAsync();
                        break;
                    }
            }
        }
    }
}