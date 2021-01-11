using Meowv.Blog.Dto.Authorize.Params;
using Meowv.Blog.Options;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;

namespace Meowv.Blog.Authorize.Impl
{
    public class AuthorizeService : ServiceBase, IAuthorizeService
    {
        private readonly AuthorizeOptions _authorizeOption;
        private readonly JwtOptions _jwtOption;

        public AuthorizeService(IOptions<AuthorizeOptions> authorizeOption, IOptions<JwtOptions> jwtOption)
        {
            _authorizeOption = authorizeOption.Value;
            _jwtOption = jwtOption.Value;
        }

        /// <summary>
        /// Generate token by account.
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [Route("api/meowv/authorize/account/token")]
        public async Task<BlogResponse<string>> GenerateTokenByAccountAsync(AccountInput input)
        {
            var response = new BlogResponse<string>();

            if (input.Username != _authorizeOption.Account.Username || input.Password != _authorizeOption.Account.Password)
            {
                response.IsFailed("The username or password entered is incorrect.");
                return response;
            }

            var claims = new[] {
                new Claim(ClaimTypes.Name, input.Username),
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

            response.IsSuccess(token);
            return await Task.FromResult(response);
        }
    }
}