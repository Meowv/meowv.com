namespace Meowv.Api.Modules.Music.Domain;

internal sealed record QQSessionStatus(
    string Status,
    QQLoginAttempt? Attempt,
    string[] Devices,
    bool CanLogin,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    string? ConfigurationIssue = null);
