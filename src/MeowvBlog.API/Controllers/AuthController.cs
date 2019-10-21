using MeowvBlog.Core.Configurations;
using MeowvBlog.Core.Dto;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;

namespace MeowvBlog.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [AllowAnonymous]
    public class AuthController : ControllerBase
    {
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
    }
}