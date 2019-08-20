using MeowvBlog.Core.Domain.Blog;
using MeowvBlog.Core.Domain.Blog.Repositories;
using MeowvBlog.Services.Dto;
using MeowvBlog.Services.Dto.Blog;
using Plus;
using Plus.AutoMapper;
using Plus.Services.Dto;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Blog.Impl
{
    public partial class BlogService : ServiceBase, IBlogService
    {
        private readonly IPostRepository _postRepository;
        private readonly ITagRepository _tagRepository;
        private readonly IPostTagRepository _postTagRepository;
        private readonly ICategoryRepository _categoryRepository;
        private readonly IFriendLinkRepository _friendLinkRepository;

        public BlogService(
            IPostRepository postRepository,
            ITagRepository tagRepository,
            IPostTagRepository postTagRepository,
            ICategoryRepository categoryRepository,
            IFriendLinkRepository friendLinkRepository)
        {
            _postRepository = postRepository;
            _tagRepository = tagRepository;
            _postTagRepository = postTagRepository;
            _categoryRepository = categoryRepository;
            _friendLinkRepository = friendLinkRepository;
        }

        /// <summary>
        /// 新增文章
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> InsertPost(PostForAdminDto dto)
        {
            var output = new ActionOutput<string>();

            var post = new Post
            {
                Title = dto.Title,
                Author = dto.Author,
                Url = $"{dto.CreationTime?.ToString(" yyyy MM dd ").Replace(" ", "/")}{dto.Url}/",
                Html = dto.Html,
                Markdown = dto.Markdown,
                CreationTime = dto.CreationTime,
                CategoryId = dto.CategoryId
            };
            var id = _postRepository.InsertAsync(post).Result.Id;

            var tags = await _tagRepository.GetAllListAsync();

            var newTags = new List<Tag>();
            foreach (var item in dto.Tags)
            {
                if (!tags.Any(x => x.TagName == item))
                {
                    newTags.Add(new Tag
                    {
                        TagName = item,
                        DisplayName = item
                    });
                }
            }
            await _tagRepository.BulkInsertTagsAsync(newTags);

            var postTags = new List<PostTag>();
            foreach (var item in dto.Tags)
            {
                var tagId = _tagRepository.FirstOrDefaultAsync(x => x.TagName == item).Result.Id;

                postTags.Add(new PostTag
                {
                    PostId = id,
                    TagId = tagId
                });
            }
            await _postTagRepository.BulkInsertPostTagsAsync(postTags);

            output.Result = "success";

            return output;
        }

        /// <summary>
        /// 删除文章
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> DeletePost(int id)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<string>();

                await _postRepository.DeleteAsync(id);
                await uow.CompleteAsync();

                output.Result = "success";

                return output;
            }
        }

        /// <summary>
        /// 更新文章
        /// </summary>
        /// <param name="id"></param>
        /// <param name="dto"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> UpdatePost(int id, PostForAdminDto dto)
        {
            var output = new ActionOutput<string>();

            var post = new Post
            {
                Id = id,
                Title = dto.Title,
                Author = dto.Author,
                Url = $"{dto.CreationTime?.ToString(" yyyy MM dd ").Replace(" ", "/")}{dto.Url}/",
                Html = dto.Html,
                Markdown = dto.Markdown,
                CreationTime = dto.CreationTime,
                CategoryId = dto.CategoryId
            };

            await _postRepository.UpdateAsync(post);

            var tags = await _tagRepository.GetAllListAsync();

            var oldPostTags = (from post_tags in await _postTagRepository.GetAllListAsync()
                            join tag in await _tagRepository.GetAllListAsync()
                            on post_tags.TagId equals tag.Id
                            where post_tags.PostId == post.Id
                            select new
                            {
                                post_tags.Id,
                                tag.TagName
                            }).ToList();

            foreach (var item in oldPostTags)
            {
                if (!dto.Tags.Any(x => x == item.TagName) && tags.Any(t => t.TagName == item.TagName))
                {
                    await _postTagRepository.DeleteAsync(item.Id);
                }
            }

            var newTags = new List<Tag>();
            foreach (var item in dto.Tags)
            {
                if (!tags.Any(x => x.TagName == item))
                {
                    newTags.Add(new Tag
                    {
                        TagName = item,
                        DisplayName = item
                    });
                }
            }
            await _tagRepository.BulkInsertTagsAsync(newTags);

            var postTags = new List<PostTag>();
            foreach (var item in dto.Tags)
            {
                if (!oldPostTags.Any(x => x.TagName == item))
                {
                    var tagId = _tagRepository.FirstOrDefaultAsync(x => x.TagName == item).Result.Id;
                    postTags.Add(new PostTag
                    {
                        PostId = id,
                        TagId = tagId
                    });
                }
            }
            await _postTagRepository.BulkInsertPostTagsAsync(postTags);

            output.Result = "success";

            return output;
        }

        /// <summary>
        /// 获取文章
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        public async Task<ActionOutput<GetPostDto>> GetPost(string url)
        {
            var output = new ActionOutput<GetPostDto>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var post = await _postRepository.FirstOrDefaultAsync(x => x.Url == url);
                if (post.IsNull())
                {
                    output.AddError("找了找不到了~~~");
                    return output;
                }

                var category = await _categoryRepository.FirstOrDefaultAsync(x => x.Id == post.CategoryId);

                var tags = (from post_tags in await _postTagRepository.GetAllListAsync()
                            join tag in await _tagRepository.GetAllListAsync()
                            on post_tags.TagId equals tag.Id
                            where post_tags.PostId == post.Id
                            select new TagDto
                            {
                                TagName = tag.TagName,
                                DisplayName = tag.DisplayName
                            }).ToList();

                var previous = _postRepository.GetAll()
                                              .Where(x => x.CreationTime > post.CreationTime)
                                              .Take(1)
                                              .FirstOrDefault();

                var next = _postRepository.GetAll()
                                          .Where(x => x.CreationTime < post.CreationTime)
                                          .OrderByDescending(x => x.CreationTime)
                                          .Take(1)
                                          .FirstOrDefault();

                await uow.CompleteAsync();

                var result = post.MapTo<GetPostDto>();
                result.CreationTime = Convert.ToDateTime(result.CreationTime).ToString("MMMM dd, yyyy HH:mm:ss", new CultureInfo("en-us"));
                result.Category = category.MapTo<CategoryDto>();
                result.Tags = tags;
                result.Previous = previous.MapTo<PostForPagedDto>();
                result.Next = next.MapTo<PostForPagedDto>();

                output.Result = result;

                return output;
            }
        }

        /// <summary>
        /// 分页查询文章列表
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<PagedResultDto<QueryPostDto>> QueryPosts(PagingInput input)
        {
            var posts = await _postRepository.GetAllListAsync();

            var count = posts.Count;

            var list = posts.OrderByDescending(x => x.CreationTime).AsQueryable().PageByIndex(input.Page, input.Limit).ToList();

            var dtos = list.MapTo<IList<PostBriefDto>>().ToList();
            dtos.ForEach(x =>
            {
                x.CreationTime = Convert.ToDateTime(x.CreationTime).ToString("MMMM dd, yyyy HH:mm:ss", new CultureInfo("en-us"));
                x.Year = Convert.ToDateTime(x.CreationTime).Year;
            });

            var result = new List<QueryPostDto>();

            var group = dtos.GroupBy(x => x.Year).ToList();
            group.ForEach(x =>
            {
                result.Add(new QueryPostDto
                {
                    Year = x.Key,
                    Posts = x.ToList()
                });
            });

            return new PagedResultDto<QueryPostDto>(count, result);
        }

        /// <summary>
        /// 通过标签查询文章列表
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        public async Task<IList<QueryPostDto>> QueryPostsByTag(string name)
        {
            var query = (from post_tags in await _postTagRepository.GetAllListAsync()
                         join tags in await _tagRepository.GetAllListAsync()
                         on post_tags.TagId equals tags.Id
                         join posts in await _postRepository.GetAllListAsync()
                         on post_tags.PostId equals posts.Id
                         where tags.DisplayName == name
                         orderby posts.CreationTime descending
                         select new PostBriefDto
                         {
                             Title = posts.Title,
                             Url = posts.Url,
                             CreationTime = posts.CreationTime?.ToString("MMMM dd, yyyy HH:mm:ss", new CultureInfo("en-us")),
                             Year = posts.CreationTime.Value.Year
                         }).GroupBy(x => x.Year).ToList();

            var result = new List<QueryPostDto>();

            query.ForEach(x =>
            {
                result.Add(new QueryPostDto
                {
                    Year = x.Key,
                    Posts = x.ToList()
                });
            });

            return result;
        }

        /// <summary>
        /// 通过分类查询文章列表
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        public async Task<IList<QueryPostDto>> QueryPostsByCategory(string name)
        {
            var query = (from posts in await _postRepository.GetAllListAsync()
                         join categories in await _categoryRepository.GetAllListAsync()
                         on posts.CategoryId equals categories.Id
                         where categories.DisplayName == name
                         orderby posts.CreationTime descending
                         select new PostBriefDto
                         {
                             Title = posts.Title,
                             Url = posts.Url,
                             CreationTime = posts.CreationTime?.ToString("MMMM dd, yyyy HH:mm:ss", new CultureInfo("en-us")),
                             Year = posts.CreationTime.Value.Year
                         }).GroupBy(x => x.Year).ToList();

            var result = new List<QueryPostDto>();

            query.ForEach(x =>
            {
                result.Add(new QueryPostDto
                {
                    Year = x.Key,
                    Posts = x.ToList()
                });
            });

            return result;
        }

        /// <summary>
        /// 分页查询文章列表 For Admin
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<PagedResultDto<QueryPostForAdminDto>> QueryPostsForAdmin(PagingInput input)
        {
            var posts = await _postRepository.GetAllListAsync();

            var count = posts.Count;

            var list = posts.OrderByDescending(x => x.CreationTime).AsQueryable().PageByIndex(input.Page, input.Limit).ToList();

            var dtos = list.MapTo<IList<PostBriefForAdminDto>>().ToList();
            dtos.ForEach(x =>
            {
                x.CreationTime = Convert.ToDateTime(x.CreationTime).ToString("MMMM dd, yyyy HH:mm:ss", new CultureInfo("en-us"));
                x.Year = Convert.ToDateTime(x.CreationTime).Year;
            });

            var result = new List<QueryPostForAdminDto>();

            var group = dtos.GroupBy(x => x.Year).ToList();
            group.ForEach(x =>
            {
                result.Add(new QueryPostForAdminDto
                {
                    Year = x.Key,
                    Posts = x.ToList()
                });
            });

            return new PagedResultDto<QueryPostForAdminDto>(count, result);
        }

        /// <summary>
        /// 根据Id获取文章详细数据
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public async Task<ActionOutput<GetPostForAdminDto>> GetPostForAdmin(int id)
        {
            var output = new ActionOutput<GetPostForAdminDto>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var post = await _postRepository.FirstOrDefaultAsync(x => x.Id == id);
                if (post.IsNull())
                {
                    output.AddError("找了找不到了~~~");
                    return output;
                }

                var tags = from post_tags in await _postTagRepository.GetAllListAsync()
                           join tag in await _tagRepository.GetAllListAsync()
                           on post_tags.TagId equals tag.Id
                           where post_tags.PostId == post.Id
                           select tag.TagName;

                await uow.CompleteAsync();

                var result = post.MapTo<GetPostForAdminDto>();
                result.Tags = string.Join(",", tags);
                result.Url = result.Url.Split("/").Where(x => x.IsNotNullOrEmpty()).Last();

                output.Result = result;

                return output;
            }
        }

        /// <summary>
        /// 查询所有文章供生成RSS使用
        /// </summary>
        /// <returns></returns>
        public async Task<IList<PostRssDto>> QueryPostRss()
        {
            return (from posts in await _postRepository.GetAllListAsync()
                    join categories in await _categoryRepository.GetAllListAsync()
                    on posts.CategoryId equals categories.Id
                    orderby posts.CreationTime descending
                    select new PostRssDto
                    {
                        Title = posts.Title,
                        Link = posts.Url,
                        Description = ReplaceHtml(posts.Html, 200),
                        Author = posts.Author,
                        Category = categories.CategoryName,
                        PubDate = posts.CreationTime
                    }).ToList();
        }
    }
}