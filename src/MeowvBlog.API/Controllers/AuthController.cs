using MeowvBlog.API.Configurations;
using MeowvBlog.API.Extensions;
using MeowvBlog.API.Models.Dto.Response;
using MeowvBlog.API.Models.Entity.GitHub;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using System;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net;
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
        /// 获取 Github 登录地址
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
        /// 获取 access_token
        /// </summary>
        /// <param name="code"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("access_token")]
        public async Task<Response<string>> GetAccessTokenAsync(string code)
        {
            var response = new Response<string>();

            var request = new AccessTokenRequest();
            if (string.IsNullOrEmpty(code))
            {
                response.Msg = "code 为空";
                return response;
            }

            var content = new StringContent($"code={code}&client_id={request.Client_ID}&redirect_uri={request.Redirect_Uri}&client_secret={request.Client_Secret}");
            content.Headers.ContentType = new MediaTypeHeaderValue("application/x-www-form-urlencoded");

            using var client = _httpClient.CreateClient();
            var httpResponse = await client.PostAsync(GitHubConfig.API_AccessToken, content);
            var result = await httpResponse.Content.ReadAsStringAsync();
            if (result.StartsWith("access_token"))
                response.Result = result.Split("=")[1].Split("&").First();
            else
                response.Msg = "code 有误";

            return response;
        }

        /// <summary>
        /// 生成 Token
        /// </summary>
        /// <param name="access_token"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("token")]
        public async Task<Response<string>> GenerateTokenAsync(string access_token)
        {
            var response = new Response<string>();

            if (string.IsNullOrEmpty(access_token))
            {
                response.Msg = "access_token 为空";
                return response;
            }

            var url = $"{GitHubConfig.API_User}?access_token={access_token}";
            using var client = _httpClient.CreateClient();
            client.DefaultRequestHeaders.Add("user-agent", "Mozilla/5.0");
            var httpResponse = await client.GetAsync(url);
            if (httpResponse.StatusCode != HttpStatusCode.OK)
            {
                response.Msg = "access_token 有误";
                return response;
            }
            var content = await httpResponse.Content.ReadAsStringAsync();

            var user = content.DeserializeFromJson<UserResponse>();
            if (null == user)
            {
                response.Msg = "未获取到用户数据";
                return response;
            }

            if (user.id != GitHubConfig.Id)
            {
                response.Msg = "当前账号未授权";
                return response;
            }

            var claims = new[] {
                new Claim(ClaimTypes.Name, user.name),
                new Claim(ClaimTypes.Email, user.email),
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

            var result = new JwtSecurityTokenHandler().WriteToken(token);
            response.Result = result;
            return response;
        }
    }
}