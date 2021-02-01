using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.Blog.Repositories;
using Meowv.Blog.Extensions;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.DataSeed
{
    public class BlogDataSeedService : ITransientDependency
    {
        private readonly ICategoryRepository _categories;
        private readonly ITagRepository _tags;
        private readonly IPostRepository _posts;

        public BlogDataSeedService(ICategoryRepository categories, ITagRepository tags, IPostRepository posts)
        {
            _categories = categories;
            _tags = tags;
            _posts = posts;
        }

        public async Task SeedAsync()
        {
            {
                if (await _categories.GetCountAsync() == 0)
                {
                    var path = Path.Combine(Directory.GetCurrentDirectory(), "categories.json");

                    var categories = await path.FromJsonFile<List<Category>>("RECORDS");
                    if (!categories.Any()) return;

                    await _categories.InsertManyAsync(categories);

                    Console.WriteLine($"Successfully processed {categories.Count} category data.");
                }
            }

            {
                if (await _tags.GetCountAsync() == 0)
                {
                    var path = Path.Combine(Directory.GetCurrentDirectory(), "tags.json");

                    var tags = await path.FromJsonFile<List<Tag>>("RECORDS");
                    if (!tags.Any()) return;

                    await _tags.InsertManyAsync(tags);

                    Console.WriteLine($"Successfully processed {tags.Count} tag data.");
                }
            }

            {

            }
        }
    }
}