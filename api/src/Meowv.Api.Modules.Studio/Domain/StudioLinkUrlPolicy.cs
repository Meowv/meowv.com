namespace Meowv.Api.Modules.Studio.Domain;

public static class StudioLinkUrlPolicy
{
    private static readonly string[] AllowedSchemes = ["http", "https"];

    public static bool IsAllowed(string? url, out string? reason)
    {
        reason = null;

        if (string.IsNullOrWhiteSpace(url))
        {
            reason = "URL is empty.";
            return false;
        }

        foreach (var ch in url)
            if (char.IsControl(ch))
            {
                reason = "URL contains control characters.";
                return false;
            }

        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            reason = "URL is not absolute.";
            return false;
        }

        var scheme = uri.Scheme.ToLowerInvariant();
        if (!AllowedSchemes.Contains(scheme))
        {
            reason = $"Scheme '{scheme}' is not allowed; only http and https are permitted.";
            return false;
        }

        return true;
    }

    public static bool IsAllowed(string? url)
    {
        return IsAllowed(url, out _);
    }
}