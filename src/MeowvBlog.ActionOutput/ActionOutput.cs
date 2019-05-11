using System;
using System.Collections.Generic;
using System.Text;

namespace MeowvBlog.ActionOutput
{
    public class ActionOutput
    {
        public IList<string> Errors { get; }

        public bool Success => Errors.Count == 0;

        public Exception Exception { get; set; }

        public ActionOutput() => Errors = new List<string>();

        public void AddError(string error, Exception exception = null)
        {
            Errors.Add(error);
            Exception = exception;
        }

        public string GetErrorMessage()
        {
            if (Errors.Count > 0)
            {
                StringBuilder stringBuilder = new StringBuilder();
                foreach (var error in Errors)
                {
                    stringBuilder.AppendLine(error);
                }
                return stringBuilder.ToString();
            }
            return string.Empty;
        }
    }
}