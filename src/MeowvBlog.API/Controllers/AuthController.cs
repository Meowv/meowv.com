using MeowvBlog.Core.Configurations;
using MeowvBlog.Core.Dto;
using MeowvBlog.Core.GitHub;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;

namespace MeowvBlog.API.Controllers
{
    [ApiController]
    [AllowAnonymous]
    [Route("[controller]")]
    [Produces("application/json")]
    public class AuthController : ControllerBase
    {
        private readonly IHttpClientFactory _httpClient;

        public AuthController(IHttpClientFactory httpClient)
        {
            _httpClient = httpClient;
        }

        /// <summary>
        /// 获取Token
        /// </summary>
        /// <param name="username"></param>
        /// <param name="password"></param>
        /// <returns></returns>
        [HttpPost]
        public async Task<Response<string>> Token(string username = "qix", string password = "123")
        {
            var response = new Response<string>();

            if (username == "qix" && password == "123")
            {
                var claims = new[]
                {
                    new Claim(ClaimTypes.Name,username),
                    new Claim(JwtRegisteredClaimNames.Exp, $"{new DateTimeOffset(DateTime.Now.AddMinutes(AppSettings.JWT.Expires)).ToUnixTimeSeconds()}"),
                    new Claim(JwtRegisteredClaimNames.Nbf, $"{new DateTimeOffset(DateTime.Now).ToUnixTimeSeconds()}")
                };

                var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(AppSettings.JWT.SecurityKey));
                var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
                var token = new JwtSecurityToken(
                    issuer: AppSettings.JWT.Domain,
                    audience: AppSettings.JWT.Domain,
                    claims: claims,
                    expires: DateTime.Now.AddMinutes(AppSettings.JWT.Expires),
                    signingCredentials: creds);

                response.Result = new JwtSecurityTokenHandler().WriteToken(token);
            }
            else response.Msg = "账号或密码错误";

            return await Task.FromResult(response);
        }

        /// <summary>
        /// 获取 GitHub 登录地址
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("url")]
        public async Task<Response<string>> GetGithubLoginUrlAsync()
        {
            var response = new Response<string>();

            var request = new AuthorizeRequest();
            response.Result = string.Concat(new string[]
            {
                GitHubConfig.API_Authorize,
                "?client_id=",request.Client_ID,
                "&scope=",request.Scope,
                "&state=",request.State,
                "&redirect_uri=", request.Redirect_Uri
            });

            return await Task.FromResult(response);
        }

        /// <summary>
        /// 获取 access token
        /// </summary>
        /// <param name="code"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("access_token")]
        public async Task<Response<string>> GetAccessTokenAsync(string code)
        {
            var response = new Response<string>();

            var request = new AccessTokenRequest();

            var content = new StringContent($"code={code}&client_id={request.Client_ID}&redirect_uri={request.Redirect_Uri}&client_secret=request.Client_Secret");
            content.Headers.ContentType = new MediaTypeHeaderValue("application/x-www-form-urlencoded");

            using var client = _httpClient.CreateClient();
            var result = await client.PostAsync(GitHubConfig.API_AccessToken, content);

            response.Result = await result.Content.ReadAsStringAsync();
            return response;
        }
    }
}