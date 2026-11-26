namespace Meowv.Api.SharedKernel;

public static class ApiCredentials
{
    public const string QueryParameter = "access_token";

    public static ApiCredential ReadAccessCode(HttpRequest request) => Read(request, "Authorization", "Bearer ");

    public static ApiCredential ReadManagementToken(HttpRequest request) => Read(request, "X-Api-Bootstrap-Token", null);

    public static bool AllowsQueryCredential(HttpRequest request) =>
        HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method) || HttpMethods.IsOptions(request.Method);

    private static ApiCredential Read(HttpRequest request, string headerName, string? prefix)
    {
        var header = request.Headers[headerName];
        var query = request.Query[QueryParameter];
        switch (header.Count)
        {
            case > 0 when query.Count > 0:
            case > 0 when header.Count != 1:
            {
                return new ApiCredential(ApiCredentialState.Invalid, null, false);
            }
            case > 0:
            {
                var value = header.ToString();
                if (prefix is not null)
                {
                    if (!value.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return new ApiCredential(ApiCredentialState.Invalid, null, false);
                    value = value[prefix.Length..];
                }

                value = value.Trim();
                return value.Length == 0 ? new ApiCredential(ApiCredentialState.Invalid, null, false) : new ApiCredential(ApiCredentialState.Valid, value, false);
            }
        }

        if (query.Count == 0) return new ApiCredential(ApiCredentialState.Missing, null, false);
        if (query.Count != 1 || !AllowsQueryCredential(request)) return new ApiCredential(ApiCredentialState.Invalid, null, true);
        var text = query[0]?.Trim();
        return string.IsNullOrEmpty(text) ? new ApiCredential(ApiCredentialState.Invalid, null, true) : new ApiCredential(ApiCredentialState.Valid, text, true);
    }
}