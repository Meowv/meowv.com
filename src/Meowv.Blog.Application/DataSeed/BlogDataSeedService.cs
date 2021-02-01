using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.Blog.Repositories;
using Meowv.Blog.Dto.Blog;
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

                    var categories = await path.FromJsonFile<List<Category>>();
                    if (!categories.Any()) return;

                    await _categories.InsertManyAsync(categories);

                    Console.WriteLine($"Successfully processed {categories.Count} category data.");
                }
            }

            {
                if (await _tags.GetCountAsync() == 0)
                {
                    var path = Path.Combine(Directory.GetCurrentDirectory(), "tags.json");

                    var tags = await path.FromJsonFile<List<Tag>>();
                    if (!tags.Any()) return;

                    await _tags.InsertManyAsync(tags);

                    Console.WriteLine($"Successfully processed {tags.Count} tag data.");
                }
            }

            {
                if (await _posts.GetCountAsync() == 0)
                {
                    var path = Path.Combine(Directory.GetCurrentDirectory(), "posts.json");

                    var data = await path.FromJsonFile<List<PostModel>>();
                    if (!data.Any()) return;

                    var categories = await _categories.GetListAsync();
                    var tags = await _tags.GetListAsync();

                    var posts = data.Select(x => new Post
                    {
                        Title = x.Title,
                        Author = x.Author,
                        Url = x.Url,
                        Markdown = x.Markdown,
                        Category = categories.FirstOrDefault(c => c.Name == x.Category),
                        Tags = tags.Where(t => x.Tag.Contains(t.Name)).ToList(),
                        CreatedAt = x.CreatedAt
                    });

                    await _posts.InsertManyAsync(posts);

                    Console.WriteLine($"Successfully processed {posts.Count()} post data.");
                }
            }
        }
    }
}