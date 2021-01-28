namespace Meowv.Blog.Options
{
    public class JwtOptions
    {
        /// <summary>
        /// Get or set the expiration time(minutes) of the verification token.
        /// </summary>
        public int Expires { get; set; } = 720;

        /// <summary>
        /// Gets or sets a System.String that represents a valid issuer that will be used to check against the token's issuer.
        /// </summary>
        public string Issuer { get; set; }

        /// <summary>
        /// Gets or sets a string that represents a valid audience that will be used to check against the token's audience.
        /// </summary>
        public string Audience { get; set; }

        /// <summary>
        /// Gets or sets the Microsoft.IdentityModel.Tokens.SecurityKey that is to be used for signature validation.
        /// </summary>
        public string SigningKey { get; set; }
    }
}