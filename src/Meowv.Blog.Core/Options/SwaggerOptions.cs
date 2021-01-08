namespace Meowv.Blog.Options
{
    public class SwaggerOptions
    {
        /// <summary>
        /// The version of the OpenAPI document.
        /// </summary>
        public string Version { get; set; }

        /// <summary>
        /// A URI-friendly name that uniquely identifies the document.
        /// </summary>
        public string Name { get; set; }

        /// <summary>
        /// The title of the application.
        /// </summary>
        public string Title { get; set; }

        /// <summary>
        /// A short description of the application.
        /// </summary>
        public string Description { get; set; }

        /// <summary>
        /// Gets or sets a route prefix for accessing the swagger-ui
        /// </summary>
        public string RoutePrefix { get; set; }

        /// <summary>
        /// Gets or sets a title for the swagger-ui page
        /// </summary>
        public string DocumentTitle { get; set; }
    }
}