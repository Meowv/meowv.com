using AntDesign;
using Meowv.Blog.Admin.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Shared
{
    public partial class Header
    {
        [Inject]
        NavigationManager NavigationManager { get; set; }

        [Inject] public AuthenticationStateProvider AuthenticationStateProvider { get; set; }

        [CascadingParameter]
        private Task<AuthenticationState> AuthenticationState { get; set; }

        public string Avatar { get; set; }

        public string Name { get; set; }

        protected override async Task OnInitializedAsync()
        {
            var state = await AuthenticationState;
            var user = state.User;

            if (user.Identity.IsAuthenticated)
            {
                Name = user.Claims?.FirstOrDefault(x => x.Type == ClaimTypes.Name).Value;
                Avatar = user.Claims?.FirstOrDefault(x => x.Type == "avatar").Value;
            }
        }

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