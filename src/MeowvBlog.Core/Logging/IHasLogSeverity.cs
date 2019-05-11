namespace MeowvBlog.Core.Logging
{
    public interface IHasLogSeverity
    {
        LogSeverity Severity { get; set; }
    }
}