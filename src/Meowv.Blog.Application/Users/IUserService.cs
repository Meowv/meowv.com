using Meowv.Blog.Domain.Users;
using Meowv.Blog.Dto.Users;
using Meowv.Blog.Dto.Users.Params;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Users
{
    public interface IUserService
    {
        Task<BlogResponse> CreateUserAsync(CreateUserInput input);

        Task<BlogResponse> UpdateUserAsync(string id, UpdateUserinput input);

        Task<BlogResponse> SettingAdminAsync(string id, bool isAdmin);

        Task<BlogResponse<List<UserDto>>> GetUsersAsync();

        Task<User> VerifyByAccountAsync(string username, string password);

        Task<User> VerifyByOAuthAsync(string type, string identity);
    }
}