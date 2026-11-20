namespace Meowv.Api.Modules.Music.QQ;

internal sealed record QQSessionStatus(
    string Status,
    QQLoginAttempt? Attempt,
    string[] Devices,
    bool CanLogin,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    string? ConfigurationIssue = null);