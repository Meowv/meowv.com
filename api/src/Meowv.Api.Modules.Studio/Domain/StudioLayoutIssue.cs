namespace Meowv.Api.Modules.Studio.Domain;

public sealed record StudioLayoutIssue(StudioLayoutIssueSeverity Severity, string Code, string Path, string Message);