using Meowv.Blog.Domain.Users;
using Meowv.Blog.Domain.Users.Repositories;
using Meowv.Blog.Extensions;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
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

            var path = Path.Combine(Directory.GetCurrentDirectory(), "users.json");

            var users = await path.FromJsonFile<List<User>>("RECORDS");
            if (!users.Any()) return;

            await _users.InsertManyAsync(users);

            Console.WriteLine($"Successfully processed {users.Count} user data.");
        }
    }
}