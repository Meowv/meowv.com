using Meowv.Blog.Domain.Sayings;
using Meowv.Blog.Domain.Sayings.Repositories;
using Meowv.Blog.Extensions;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.DataSeed
{
    public class SayingDataSeedService : ITransientDependency
    {
        private readonly ISayingRepository _sayings;

        public SayingDataSeedService(ISayingRepository sayings)
        {
            _sayings = sayings;
        }

        public async Task SeedAsync()
        {
            if (await _sayings.GetCountAsync() > 0) return;

            var path = Path.Combine(Directory.GetCurrentDirectory(), "sayings.json");

            var sayings = await path.FromJsonFile<List<string>>("RECORDS");
            if (!sayings.Any()) return;

            await _sayings.InsertManyAsync(sayings.Select(item => new Saying { Content = item }));

            Console.WriteLine($"Successfully processed {sayings.Count} saying data.");
        }
    }
}