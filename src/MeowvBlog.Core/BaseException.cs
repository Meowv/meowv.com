using System;
using System.Runtime.Serialization;

namespace MeowvBlog.Core
{
    /// <summary>
    /// BaseException
    /// </summary>
    [Serializable]
    public class BaseException : Exception
    {
        /// <summary>
        /// BaseException
        /// </summary>
        public BaseException()
        {
        }

        /// <summary>
        /// BaseException
        /// </summary>
        /// <param name="serializetionInfo"></param>
        /// <param name="context"></param>
        public BaseException(SerializationInfo serializetionInfo, StreamingContext context)
            : base(serializetionInfo, context)
        {
        }

        /// <summary>
        /// BaseException
        /// </summary>
        /// <param name="message"></param>
        public BaseException(string message)
            : base(message)
        {
        }

        /// <summary>
        /// BaseException
        /// </summary>
        /// <param name="message"></param>
        /// <param name="innerException"></param>
        public BaseException(string message, Exception innerException)
            : base(message, innerException)
        {
        }
    }
}