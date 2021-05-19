namespace Meowv.Blog.Options
{
    public class AppOptions
    {
        /// <summary>
        /// Swagger
        /// </summary>
        public SwaggerOptions Swagger { get; set; }

        /// <summary>
        /// SCKEY
        /// </summary>
        public string ScKey { get; set; }

        /// <summary>
        /// Storage
        /// </summary>
        public StorageOptions Storage { get; set; }

        /// <summary>
        /// Cors
        /// </summary>
        public CorsOptions Cors { get; set; }

        /// <summary>
        /// Jwt
        /// </summary>
        public JwtOptions Jwt { get; set; }

        /// <summary>
        /// Worker
        /// </summary>
        public WorkerOptions Worker { get; set; }

        /// <summary>
        /// Signature
        /// </summary>
        public SignatureOptions Signature { get; set; }

        /// <summary>
        /// TencentCloud
        /// </summary>
        public TencentCloudOptions TencentCloud { get; set; }

        /// <summary>
        /// Authorize
        /// </summary>
        public AuthorizeOptions Authorize { get; set; }
    }
}