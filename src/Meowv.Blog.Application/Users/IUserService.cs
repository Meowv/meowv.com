using Meowv.Blog.Dto.Users.Params;
using Meowv.Blog.Response;
using System.Threading.Tasks;

namespace Meowv.Blog.Users
{
    public interface IUserService
    {
        Task<BlogResponse> CreateUserAsync(CreateUserInput input);

        Task<BlogResponse> UpdateUserAsync(string id, UpdateUserinput input);

        Task<BlogResponse> SettingAdminAsync(string id, bool isAdmin);
    }
}