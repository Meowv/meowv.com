using Castle.Core.Logging;
using Castle.Facilities.Logging;
using Castle.Windsor;
using MeowvBlog.Core.IO;
using MeowvBlog.Log4Net;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System;
using System.IO;

namespace MeowvBlog.Log4Net_Tests
{
    [TestClass]
    public class Log4Net_Tests
    {
        [TestMethod]
        public void WriteLogsToTextFile()
        {
            var logFilePath = Path.Combine(Directory.GetCurrentDirectory(), "log4net_test_logs.txt");
            FileHelper.DeleteIfExists(logFilePath);

            var container = new WindsorContainer();
            container.AddFacility<LoggingFacility>(facility =>
            {
                facility.UseLog4Net().WithConfig("log4net.config");
            });

            var logger = container.Resolve<ILoggerFactory>().Create(typeof(Log4Net_Tests));
            logger.Info("success£¬this is a test text!");

            Console.WriteLine(File.Exists(logFilePath));
        }
    }
}