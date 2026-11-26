namespace Meowv.Api.Modules.Studio.Domain;

public sealed class StudioAdminStats
{
    public int UserCount { get; set; }

    public int AdminCount { get; set; }

    public int VerifiedCount { get; set; }

    public int ActiveSessionCount { get; set; }

    public int SessionCount { get; set; }

    public int LayoutCount { get; set; }

    public int PreferenceCount { get; set; }

    public long DatabaseBytes { get; set; }

    public string DatabaseNote { get; set; } = "SQLite single-file database; per-table sizes are not reported.";
}