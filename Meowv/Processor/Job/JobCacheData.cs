using System;

namespace Meowv.Processor.Job
{
    public class JobCacheData<T>
    {
        public DateTime ExpirationTime { get; set; }
        public T Data { get; set; }
    }
}