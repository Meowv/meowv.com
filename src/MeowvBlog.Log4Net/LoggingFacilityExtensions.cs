using Castle.Facilities.Logging;

namespace MeowvBlog.Log4Net
{
    public static class LoggingFacilityExtensions
    {
        public static LoggingFacility UseLog4Net(this LoggingFacility loggingFacility)
        {
            return loggingFacility.LogUsing<Log4NetLoggerFactory>();
        }
    }
}