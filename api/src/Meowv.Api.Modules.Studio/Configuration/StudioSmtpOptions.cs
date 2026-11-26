namespace Meowv.Api.Modules.Studio.Configuration;

public sealed class StudioSmtpOptions
{
    public string Host { get; set; } = string.Empty;

    public int Port { get; set; } = 587;

    public string Security { get; set; } = "StartTls";

    public string From { get; set; } = string.Empty;

    public string? FromName { get; set; }

    public string? Username { get; set; }

    public string? Password { get; set; }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(Host) && !string.IsNullOrWhiteSpace(From);
}