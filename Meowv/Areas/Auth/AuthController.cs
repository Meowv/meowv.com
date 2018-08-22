using Meowv.Models.Account;
using Meowv.Models.AppSetting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace Meowv.Areas.Auth
{
    [ApiController]
    public class AuthController : ControllerBase
    {
        private AppSettings _settings;

        public AuthController(IOptions<AppSettings> option)
        {
            _settings = option.Value;
        }

        /// <summary>
        /// Token
        /// </summary>
        /// <param name="account"></param>
        /// <returns></returns>
        [Route("api/token")]
        [AllowAnonymous]
        [HttpPost]
        public IActionResult RequestToken(AccountEntity account)
        {
            if (account.UserName == _settings.UserName && account.Password == _settings.Password)
            {
                var claims = new[]
                {
                    new Claim(ClaimTypes.Name,account.UserName),
                    new Claim(JwtRegisteredClaimNames.Exp, $"{new DateTimeOffset(DateTime.Now.AddMinutes(1)).ToUnixTimeSeconds()}"),
                    new Claim(JwtRegisteredClaimNames.Nbf, $"{new DateTimeOffset(DateTime.Now).ToUnixTimeSeconds()}")
                };

                var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_settings.SecurityKey));
                var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

                var token = new JwtSecurityToken(
                    issuer: _settings.Domain,
                    audience: _settings.Domain,
                    claims: claims,
                    expires: DateTime.Now.AddMinutes(1),
                    signingCredentials: creds);

                return Ok(new { token = new JwtSecurityTokenHandler().WriteToken(token) });
            }

            return BadRequest("fuck you!!!");
        }
    }
}