using Meowv.Blog.Domain.Users;
using Meowv.Blog.Domain.Users.Repositories;
using Meowv.Blog.Dto.Users.Params;
using Meowv.Blog.Extensions;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Threading.Tasks;

namespace Meowv.Blog.Users.Impl
{
    public class UserService : ServiceBase, IUserService
    {
        private readonly IUserRepository _users;

        public UserService(IUserRepository users)
        {
            _users = users;
        }

        /// <summary>
        /// Create a user.
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [Route("api/meowv/user")]
        public async Task<BlogResponse> CreateUserAsync(CreateUserInput input)
        {
            var response = new BlogResponse();

            var user = await _users.FindAsync(x => x.Username == input.Username);
            if (user is not null)
            {
                response.IsFailed("The username already exists.");
                return response;
            }

            input.Password = input.Password.ToMd5();
            await _users.InsertAsync(new User
            {
                Username = input.Username,
                Password = input.Password,
                Type = input.Type,
                Identity = input.Identity,
                Name = input.Name,
                Avatar = input.Avatar,
                Email = input.Email
            });

            return response;
        }

        /// <summary>
        /// Update user by id.
        /// </summary>
        /// <param name="id"></param>
        /// <param name="input"></param>
        /// <returns></returns>
        [Route("api/meowv/user/{id}")]
        public async Task<BlogResponse> UpdateUserAsync(string id, UpdateUserinput input)
        {
            var response = new BlogResponse();

            var user = await _users.FindAsync(id.ToObjectId());
            if (user is null)
            {
                response.IsFailed("The user id is not exists.");
                return response;
            }

            user.Username = input.Username;
            user.Password = input.Password.ToMd5();
            user.Name = input.Name;
            user.Avatar = input.Avatar;
            user.Email = input.Email;
            await _users.UpdateAsync(user);

            return response;
        }

        /// <summary>
        /// Set user as administrator.
        /// </summary>
        /// <param name="id"></param>
        /// <param name="isAdmin"></param>
        /// <returns></returns>
        [HttpPut]
        [Route("api/meowv/user/{id}/{isAdmin}")]
        public async Task<BlogResponse> SettingAdminAsync(string id, bool isAdmin)
        {
            var response = new BlogResponse();

            var user = await _users.FindAsync(id.ToObjectId());
            if (user is null)
            {
                response.IsFailed("The user id is not exists.");
                return response;
            }

            user.IsAdmin = isAdmin;
            await _users.UpdateAsync(user);

            return response;
        }
    }
}