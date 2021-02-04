using Meowv.Blog.Authorize.OAuth;
using Meowv.Blog.Authorize.OAuth.Impl;
using Meowv.Blog.Caching.Authorize;
using Meowv.Blog.Domain.Users;
using Meowv.Blog.Dto.Authorize.Params;
using Meowv.Blog.Dto.Tools.Params;
using Meowv.Blog.Extensions;
using Meowv.Blog.Options;
using Meowv.Blog.Response;
using Meowv.Blog.Tools;
using Meowv.Blog.Users;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System;
using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Threading.Tasks;

namespace Meowv.Blog.Authorize.Impl
{
    public class AuthorizeService : ServiceBase, IAuthorizeService
    {
        private readonly JwtOptions _jwtOption;
        private readonly IToolService _toolService;
        private readonly IAuthorizeCacheService _authorizeCacheService;
        private readonly IUserService _userService;
        private readonly OAuthGithubService _githubService;
        private readonly OAuthGiteeService _giteeService;
        private readonly OAuthAlipayService _alipayService;
        private readonly OAuthDingtalkService _dingtalkService;
        private readonly OAuthMicrosoftService _microsoftService;
        private readonly OAuthWeiboService _weiboService;
        private readonly OAuthQQService _qqService;

        public AuthorizeService(IOptions<JwtOptions> jwtOption,
                                IToolService toolService,
                                IAuthorizeCacheService authorizeCacheService,
                                IUserService userService,
                                OAuthGithubService githubService,
                                OAuthGiteeService giteeService,
                                OAuthAlipayService alipayService,
                                OAuthDingtalkService dingtalkService,
                                OAuthMicrosoftService microsoftService,
                                OAuthWeiboService weiboService,
                                OAuthQQService qqService)
        {
            _jwtOption = jwtOption.Value;
            _toolService = toolService;
            _authorizeCacheService = authorizeCacheService;
            _userService = userService;
            _githubService = githubService;
            _giteeService = giteeService;
            _alipayService = alipayService;
            _dingtalkService = dingtalkService;
            _microsoftService = microsoftService;
            _weiboService = weiboService;
            _qqService = qqService;
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
                    "alipay" => await _alipayService.GetAuthorizeUrl(state),
                    "dingtalk" => await _dingtalkService.GetAuthorizeUrl(state),
                    "microsoft" => await _microsoftService.GetAuthorizeUrl(state),
                    "weibo" => await _weiboService.GetAuthorizeUrl(state),
                    "qq" => await _qqService.GetAuthorizeUrl(state),
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

            var token = type switch
            {
                "github" => GenerateToken(await _githubService.GetUserByOAuthAsync(type, code, state)),
                "gitee" => GenerateToken(await _giteeService.GetUserByOAuthAsync(type, code, state)),
                "alipay" => GenerateToken(await _alipayService.GetUserByOAuthAsync(type, code, state)),
                "dingtalk" => GenerateToken(await _dingtalkService.GetUserByOAuthAsync(type, code, state)),
                "microsoft" => GenerateToken(await _microsoftService.GetUserByOAuthAsync(type, code, state)),
                "weibo" => GenerateToken(await _weiboService.GetUserByOAuthAsync(type, code, state)),
                "qq" => GenerateToken(await _qqService.GetUserByOAuthAsync(type, code, state)),
                _ => throw new NotImplementedException($"Not implemented:{type}")
            };

            response.IsSuccess(token);
            return response;
        }

        /// <summary>
        /// Generate token by authorization code.
        /// </summary>
        /// <param name="code"></param>
        /// <returns></returns>
        [Route("api/meowv/oauth/token")]
        public async Task<BlogResponse<string>> GenerateTokenAsync([Required] string code)
        {
            var response = new BlogResponse<string>();

            var cacheCode = await _authorizeCacheService.GetAuthorizeCodeAsync();
            if (code != cacheCode)
            {
                response.IsFailed("The authorization code is wrong.");
                return response;
            }

            var user = await _userService.GetDefaultUserAsync();
            var token = GenerateToken(user);

            response.IsSuccess(token);
            return response;
        }

        /// <summary>
        /// Generate token by account.
        /// </summary>
        /// <param name="userService"></param>
        /// <param name="input"></param>
        /// <returns></returns>
        [Route("api/meowv/oauth/account/token")]
        public async Task<BlogResponse<string>> GenerateTokenAsync([FromServices] IUserService userService, AccountInput input)
        {
            var response = new BlogResponse<string>();

            var user = await userService.VerifyByAccountAsync(input.Username, input.Password);
            var token = GenerateToken(user);

            response.IsSuccess(token);
            return await Task.FromResult(response);
        }

        /// <summary>
        /// Send authorization code.
        /// </summary>
        /// <returns></returns>
        [Route("api/meowv/oauth/code/send")]
        public async Task<BlogResponse> SendAuthorizeCodeAsync()
        {
            var response = new BlogResponse();

            var length = 6;
            var code = length.GenerateRandomCode();

            await _authorizeCacheService.AddAuthorizeCodeAsync(code);

            await _toolService.SendMessageAsync(new SendMessageInput
            {
                Text = code
            });

            return response;
        }

        private string GenerateToken(User user)
        {
            var claims = new[] {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Name),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim("avatar", user.Avatar),
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