using System;

namespace Meowv.Processor.Cache
{
    public class CacheData<T>
    {
        public DateTime ExpirationTime { get; set; }
        public T Data { get; set; }
    }
}
