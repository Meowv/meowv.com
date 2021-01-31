using Meowv.Blog.Domain.Users;
using Meowv.Blog.Domain.Users.Repositories;
using System;
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

            var user = new User
            {
                Username = "meowv",
                Password = "123456".ToMd5(),
                IsAdmin = true
            };

            await _users.InsertAsync(user);
        }
    }
}