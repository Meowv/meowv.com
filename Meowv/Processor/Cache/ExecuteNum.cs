using System;

namespace Meowv.Processor.Cache
{
    public class ExecuteNum
    {
        private readonly CacheObject<long> easy;

        public string _key;

        private TimeSpan _timeSpan;

        public ExecuteNum(string key, TimeSpan timeSpan)
        {
            _key = key;
            _timeSpan = timeSpan;
            easy = new CacheObject<long>(key, timeSpan);
            easy.AddData(0L);
        }

        public long GetNum()
        {
            CacheData<long> cacheData = easy.GetData();
            if (cacheData == null)
            {
                cacheData = new CacheData<long>
                {
                    Data = 0
                };
                easy.AddData(0L);
            }
            long num = cacheData.Data + 1;
            easy.ModifyData(_key, num);
            return num;
        }
    }
}