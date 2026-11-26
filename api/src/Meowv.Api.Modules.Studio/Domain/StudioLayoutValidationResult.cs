namespace Meowv.Api.Modules.Studio.Domain;

public sealed class StudioLayoutValidationResult
{
    public List<StudioLayoutIssue> Issues { get; } = [];

    public bool IsValid => Issues.TrueForAll(issue => issue.Severity != StudioLayoutIssueSeverity.Error);

    public IEnumerable<StudioLayoutIssue> Errors => Issues.Where(issue => issue.Severity == StudioLayoutIssueSeverity.Error);

    public IEnumerable<StudioLayoutIssue> Warnings => Issues.Where(issue => issue.Severity == StudioLayoutIssueSeverity.Warning);

    internal void Error(string code, string path, string message)
    {
        Issues.Add(new StudioLayoutIssue(StudioLayoutIssueSeverity.Error, code, path, message));
    }

    internal void Warn(string code, string path, string message)
    {
        Issues.Add(new StudioLayoutIssue(StudioLayoutIssueSeverity.Warning, code, path, message));
    }
}