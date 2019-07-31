using MeowvBlog.Authorization.GitHub;
using MeowvBlog.Services.GitHub;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plus;
using Plus.WebApi;
using System.Security.Claims;
using System.Threading.Tasks;

namespace MeowvBlog.Web.Controllers.Apis
{
    [Route("api/[controller]")]
    [AllowAnonymous]
    [ApiController]
    public class AccountController : ControllerBase
    {
        private readonly IGitHubService _githubService;

        public AccountController()
        {
            _githubService = PlusEngine.Instance.Resolve<IGitHubService>();
        }

        /// <summary>
        /// 生成请求链接
        /// </summary>
        [HttpGet]
        [Route("url")]
        public async Task<Response<string>> GetGitHubUrl()
        {
            var response = new Response<string>
            {
                Result = await _githubService.GetGitHubUrl()
            };

            return response;
        }

        /// <summary>
        /// 获取token信息
        /// </summary>
        /// <param name="code"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("token")]
        public async Task<Response<AccessTokenResult>> GetAccessToken(string code)
        {
            var result = await _githubService.GetAccessToken(code);

            var response = new Response<AccessTokenResult>
            {
                Result = result.DeserializeFromJson<AccessTokenResult>()
            };

            return response;
        }

        /// <summary>
        /// 验证是否我本人
        /// </summary>
        /// <param name="token"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("login")]
        public async Task<Response<string>> Login(string token)
        {
            var response = new Response<string>();

            var result = await _githubService.GetUserResult(token);

            try
            {
                var user = result.DeserializeFromJson<UserResult>();

                var id = user.id;
                var name = user.name;
                var email = user.email;

                if (id != 13010050)
                {
                    response.Result = "你是谁?";
                    return response;
                }

                var claimIdentity = new ClaimsIdentity(CookieAuthenticationDefaults.AuthenticationScheme);
                claimIdentity.AddClaim(new Claim(ClaimTypes.NameIdentifier, id.ToString()));
                claimIdentity.AddClaim(new Claim(ClaimTypes.Name, name));
                claimIdentity.AddClaim(new Claim(ClaimTypes.Email, email));

                await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(claimIdentity));

                response.Result = name;
                return response;
            }
            catch
            {
                response.Result = "error";
                return response;
            }
        }

        /// <summary>
        /// 注销登录
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("logout")]
        public async Task<Response<string>> Logout()
        {
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return new Response<string>() { Result = "success" };
        }
    }
}