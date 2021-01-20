﻿using Meowv.Blog.Authorize.OAuth;
using Meowv.Blog.Dto.Authorize.Params;
using Meowv.Blog.Options;
using Meowv.Blog.Response;
using Meowv.Blog.Users;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Threading.Tasks;

namespace Meowv.Blog.Authorize.Impl
{
    public class AuthorizeService : ServiceBase, IAuthorizeService
    {
        private readonly AuthorizeOptions _authorizeOption;
        private readonly JwtOptions _jwtOption;
        private readonly IUserService _userService;
        private readonly OAuthGithubService _githubService;
        private readonly OAuthGiteeService _giteeService;

        public AuthorizeService(IOptions<AuthorizeOptions> authorizeOption,
                                IOptions<JwtOptions> jwtOption,
                                IUserService userService,
                                OAuthGithubService githubService,
                                OAuthGiteeService giteeService)
        {
            _authorizeOption = authorizeOption.Value;
            _jwtOption = jwtOption.Value;
            _userService = userService;
            _githubService = githubService;
            _giteeService = giteeService;
        }

        /// <summary>
        /// Get authorize url.
        /// </summary>
        /// <param name="type"></param>
        /// <returns></returns>
        [Route("api/meowv/oauth/{type}")]
        public async Task<BlogResponse<string>> GetAuthorizeUrlAsync(string type)
        {
            var state = StateManager.Instance.Get();

            var response = new BlogResponse<string>
            {
                Result = type switch
                {
                    "github" => await _githubService.GetAuthorizeUrl(state),
                    "gitee" => await _giteeService.GetAuthorizeUrl(state),
                    _ => throw new NotImplementedException($"Not implemented:{type}")
                }
            };

            return response;
        }

        /// <summary>
        /// Generate token by <paramref name="type"/>.
        /// </summary>
        /// <param name="type"></param>
        /// <param name="code"></param>
        /// <param name="state"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("api/meowv/oauth/{type}/token")]
        public async Task<BlogResponse<string>> GenerateTokenAsync(string type, string code, string state)
        {
            var response = new BlogResponse<string>();

            if (!StateManager.IsExist(state))
            {
                response.IsFailed("Request failed.");
                return response;
            }

            StateManager.Remove(state);

            var token = "";

            switch (type)
            {
                case "github":
                    {
                        var accessToken = await _githubService.GetAccessTokenAsync(code, state);
                        var user = await _githubService.GetUserInfoAsync(accessToken);

                        token = GenerateToken(user.Id, user.Name, user.Email);
                        break;
                    }

                case "gitee":
                    {
                        var accessToken = await _giteeService.GetAccessTokenAsync(code, state);
                        var user = await _giteeService.GetUserInfoAsync(accessToken);

                        token = GenerateToken(user.Id, user.Name, user.Email);
                        break;
                    }
            }

            response.IsSuccess(token);
            return response;
        }

        /// <summary>
        /// Generate token by account.
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [Route("api/meowv/oauth/account/token")]
        public async Task<BlogResponse<string>> GenerateTokenAsync(AccountInput input)
        {
            var response = new BlogResponse<string>();

            if (input.Username != _authorizeOption.Account.Username || input.Password != _authorizeOption.Account.Password)
            {
                response.IsFailed("The username or password entered is incorrect.");
                return response;
            }

            response.IsSuccess(GenerateToken(input.Username));
            return await Task.FromResult(response);
        }

        private string GenerateToken(string id = "", string name = "", string email = "")
        {
            var claims = new[] {
                new Claim(ClaimTypes.NameIdentifier, id ?? "meowv"),
                new Claim(ClaimTypes.Name, name ?? "阿星Plus"),
                new Claim(ClaimTypes.Email, email ?? "123@meowv.com"),
                new Claim(JwtRegisteredClaimNames.Exp, $"{new DateTimeOffset(DateTime.Now.AddMinutes(_jwtOption.Expires)).ToUnixTimeSeconds()}"),
                new Claim(JwtRegisteredClaimNames.Nbf, $"{new DateTimeOffset(DateTime.Now).ToUnixTimeSeconds()}")
            };

            var key = new SymmetricSecurityKey(_jwtOption.SigningKey.GetBytes());
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var securityToken = new JwtSecurityToken(
                issuer: _jwtOption.Issuer,
                audience: _jwtOption.Audience,
                claims: claims,
                expires: DateTime.Now.AddMinutes(_jwtOption.Expires),
                signingCredentials: creds);

            var token = new JwtSecurityTokenHandler().WriteToken(securityToken);
            return token;
        }
    }
}