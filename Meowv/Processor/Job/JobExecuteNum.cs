using System;

namespace Meowv.Processor.Job
{
    public class JobExecuteNum
    {
        private readonly JobCacheObject<long> easy;

        public string _key;

        private TimeSpan _timeSpan;

        public JobExecuteNum(string key, TimeSpan timeSpan)
        {
            _key = key;
            _timeSpan = timeSpan;
            easy = new JobCacheObject<long>(key, timeSpan);
            easy.AddData(0L);
        }

        public long GetNum()
        {
            JobCacheData<long> cacheData = easy.GetData();
            if (cacheData == null)
            {
                cacheData = new JobCacheData<long>
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