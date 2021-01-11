using Meowv.Blog.Dto.Authorize.Params;
using Meowv.Blog.Options;
using Meowv.Blog.Response;
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
        private readonly AuthorizeOptions _authorize;
        private readonly JwtOptions _jwt;

        public AuthorizeService(IOptions<AuthorizeOptions> authorize, IOptions<JwtOptions> jwt)
        {
            _authorize = authorize.Value;
            _jwt = jwt.Value;
        }

        /// <summary>
        /// Generate token by account.
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<BlogResponse<string>> GenerateTokenByAccountAsync(AccountInput input)
        {
            var response = new BlogResponse<string>();

            if (input.Username != _authorize.Account.Username || input.Password != _authorize.Account.Password)
            {
                response.IsFailed("The username or password entered is incorrect.");
                return response;
            }

            var claims = new[] {
                new Claim(ClaimTypes.Name, input.Username),
                new Claim(JwtRegisteredClaimNames.Exp, $"{new DateTimeOffset(DateTime.Now.AddMinutes(_jwt.Expires)).ToUnixTimeSeconds()}"),
                new Claim(JwtRegisteredClaimNames.Nbf, $"{new DateTimeOffset(DateTime.Now).ToUnixTimeSeconds()}")
            };

            var key = new SymmetricSecurityKey(_jwt.SigningKey.GetBytes());
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var securityToken = new JwtSecurityToken(
                issuer: _jwt.Issuer,
                audience: _jwt.Audience,
                claims: claims,
                expires: DateTime.Now.AddMinutes(_jwt.Expires),
                signingCredentials: creds);

            var token = new JwtSecurityTokenHandler().WriteToken(securityToken);

            response.IsSuccess(token);
            return await Task.FromResult(response);
        }
    }
}