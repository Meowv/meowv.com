using Meowv.Blog.Domain.Users;
using Meowv.Blog.Domain.Users.Repositories;
using Meowv.Blog.Dto.Users;
using Meowv.Blog.Dto.Users.Params;
using Meowv.Blog.Extensions;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Volo.Abp;
using Volo.Abp.Security.Claims;

namespace Meowv.Blog.Users.Impl
{
    [Authorize]
    public class UserService : ServiceBase, IUserService
    {
        private readonly IUserRepository _users;
        private readonly ICurrentPrincipalAccessor _principalAccessor;

        public UserService(IUserRepository users, ICurrentPrincipalAccessor currentPrincipalAccessor)
        {
            _users = users;
            _principalAccessor = currentPrincipalAccessor;
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
        /// Delete user by id.
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [Route("api/meowv/user/{id}")]
        public async Task<BlogResponse> DeleteUserAsync(string id)
        {
            var response = new BlogResponse();

            var message = await _users.FindAsync(id.ToObjectId());
            if (message is null)
            {
                response.IsFailed($"The user id not exists.");
                return response;
            }

            await _users.DeleteAsync(id.ToObjectId());

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
            user.Name = input.Name;
            user.Avatar = input.Avatar;
            user.Email = input.Email;
            await _users.UpdateAsync(user);

            return response;
        }

        /// <summary>
        /// Update user password by id.
        /// </summary>
        /// <param name="id"></param>
        /// <param name="password"></param>
        /// <returns></returns>
        [Route("api/meowv/user/password/{id}/{password}")]
        public async Task<BlogResponse> UpdatePasswordAsync(string id, string password)
        {
            var response = new BlogResponse();

            var user = await _users.FindAsync(id.ToObjectId());
            if (user is null)
            {
                response.IsFailed("The user id is not exists.");
                return response;
            }

            user.Password = password.ToMd5();
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

        /// <summary>
        /// Get the list of users.
        /// </summary>
        /// <returns></returns>
        [Route("api/meowv/users")]
        public async Task<BlogResponse<List<UserDto>>> GetUsersAsync()
        {
            var response = new BlogResponse<List<UserDto>>();

            var users = await _users.GetListAsync();
            var result = ObjectMapper.Map<List<User>, List<UserDto>>(users);

            response.IsSuccess(result);
            return response;
        }

        /// <summary>
        /// Get user by id.
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [Route("api/meowv/user/{id}")]
        public async Task<BlogResponse<UserDto>> GetUserAsync(string id)
        {
            var response = new BlogResponse<UserDto>();

            var user = await _users.FindAsync(id.ToObjectId());
            if (user is null)
            {
                response.IsFailed("The user id is not exists.");
                return response;
            }

            var result = ObjectMapper.Map<User, UserDto>(user);

            response.IsSuccess(result);
            return response;
        }

        /// <summary>
        /// Get current user.
        /// </summary>
        /// <returns></returns>
        [Route("api/meowv/user")]
        public async Task<BlogResponse<UserDto>> GetCurrentUserAsync()
        {
            var response = new BlogResponse<UserDto>();

            var claim = _principalAccessor.Principal.Claims?.FirstOrDefault((Claim c) => c.Type == ClaimTypes.NameIdentifier);
            if (claim == null || claim.Value.IsNullOrWhiteSpace())
            {
                response.IsFailed("Unauthorized.");
                return response;
            }

            return await GetUserAsync(claim.Value);
        }

        [AllowAnonymous]
        [RemoteService(false)]
        public async Task<User> CreateUserAsync(string username, string type, string identity, string name, string avatar, string email)
        {
            var user = await _users.FindAsync(x => x.Type == type && x.Identity == identity);
            if (user is null)
            {
                await _users.InsertAsync(new User
                {
                    Username = username,
                    Password = "123456".ToMd5(),
                    Type = type,
                    Identity = identity,
                    Name = name,
                    Avatar = avatar,
                    Email = email
                });

                throw new ArgumentException("Unauthorized.");
            }
            else
            {
                return user.IsAdmin ? user : throw new ArgumentException("Unauthorized.");
            }
        }

        [AllowAnonymous]
        [RemoteService(false)]
        public async Task<User> VerifyByAccountAsync(string username, string password)
        {
            var user = await _users.FindAsync(x => x.Username == username && x.Password == password.ToMd5() && x.IsAdmin);
            if (user is null)
            {
                throw new ArgumentException("The username or password entered is incorrect.");
            }
            return user;
        }

        [AllowAnonymous]
        [RemoteService(false)]
        public async Task<User> GetDefaultUserAsync()
        {
            return await Task.FromResult(_users.FirstOrDefault(x => x.IsAdmin));
        }
    }
}