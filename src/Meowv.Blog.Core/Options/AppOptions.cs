namespace Meowv.Blog.Options
{
    public class AppOptions
    {
        /// <summary>
        /// Swagger
        /// </summary>
        public SwaggerOptions Swagger { get; set; }

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
        /// BackgroundWorker
        /// </summary>
        public BackgroundWorkerOptions BackgroundWorker { get; set; }

        /// <summary>
        /// Authorize
        /// </summary>
        public AuthorizeOptions Authorize { get; set; }
    }
}