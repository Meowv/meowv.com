namespace Meowv.Api.Infrastructure;

public sealed class ApiCorsOptions
{
    public string[] AllowedOrigins { get; set; } = [];

    public static bool IsValid(ApiCorsOptions options) => options.AllowedOrigins.All(value =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
        uri.Scheme is "http" or "https" &&
        string.Equals(value.TrimEnd('/'), uri.GetLeftPart(UriPartial.Authority), StringComparison.Ordinal));
}