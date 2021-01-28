using Meowv.Blog.Dto.Users;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.Users
{
    public partial class UserList
    {
        List<UserDto> users;

        protected override async Task OnInitializedAsync()
        {
            users = await GetUserListAsync();
        }

        public async Task<List<UserDto>> GetUserListAsync()
        {
            var response = await GetResultAsync<BlogResponse<List<UserDto>>>("api/meowv/users");
            return response.Result;
        }

        public async Task ChangeIsAdminAsync(string id, bool isAdmin)
        {
            var response = await GetResultAsync<BlogResponse>($"api/meowv/user/{id}/{isAdmin}", method: HttpMethod.Put);
            if (response.Success)
            {
                await Message.Success("设置成功", 0.5);
            }
            else
            {
                await Message.Error("设置失败");
            }
        }
    }
}