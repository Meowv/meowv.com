using Meowv.Blog.Dto.Users;
using Meowv.Blog.Dto.Users.Params;
using Meowv.Blog.Response;
using Newtonsoft.Json;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.Users
{
    public partial class UserList
    {
        List<UserDto> users;

        bool visible = false;

        string userId;

        UpdateUserinput input = new UpdateUserinput();

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

        public async Task DeleteAsync(string id)
        {
            var response = await GetResultAsync<BlogResponse>($"api/meowv/user/{id}", method: HttpMethod.Delete);
            if (response.Success)
            {
                await Message.Success("删除成功", 0.5);
                users = await GetUserListAsync();
            }
            else
            {
                await Message.Error(response.Message);
            }
        }

        public async Task HandleSubmit()
        {
            var json = JsonConvert.SerializeObject(input);
            var response = await GetResultAsync<BlogResponse>($"api/meowv/user/{userId}", json, HttpMethod.Put);
            if (response.Success)
            {
                users = await GetUserListAsync();
                Close();
                await Message.Success("修改成功", 0.5);
            }
            else
            {
                await Message.Error(response.Message);
            }
        }

        private async Task Open(string id)
        {
            userId = id;

            var response = await GetResultAsync<BlogResponse<UserDto>>($"api/meowv/user/{id}");
            if (response.Success)
            {
                input.Username = response.Result.Username;
                input.Name = response.Result.Name;
                input.Email = response.Result.Email;
                input.Avatar = response.Result.Avatar;
            }
            else
            {
                await Message.Error(response.Message);
            }

            visible = true;
        }

        private void Close() => visible = false;
    }
}