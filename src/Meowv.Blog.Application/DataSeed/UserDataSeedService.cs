using Meowv.Blog.Domain.Users.Repositories;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.DataSeed
{
    public class UserDataSeedService : ITransientDependency
    {
        private readonly IUserRepository _users;

        public UserDataSeedService(IUserRepository user)
        {
            _users = user;
        }

        public async Task SeedAsync()
        {
            if (await _users.GetCountAsync() > 0) return;

            var users = DataSeedConsts.AdminUsers();

            await _users.InsertManyAsync(users);
        }
    }
}