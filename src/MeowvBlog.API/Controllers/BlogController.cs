using MeowvBlog.API.Configurations;
using MeowvBlog.API.Extensions;
using MeowvBlog.API.Infrastructure;
using MeowvBlog.API.Models.Dto;
using MeowvBlog.API.Models.Dto.Blog;
using MeowvBlog.API.Models.Dto.Response;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Xml.Linq;

namespace MeowvBlog.API.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Produces("application/json")]
    [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v1)]
    public partial class BlogController : ControllerBase
    {
        private readonly MeowvBlogDBContext _context;

        public BlogController(MeowvBlogDBContext context)
        {
            _context = context;
        }

        #region Posts

        /// <summary>
        /// 根据URL获取文章详情
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("post")]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "url" })]
        public async Task<Response<GetPostDto>> GetPostAsync(string url)
        {
            var response = new Response<GetPostDto>();

            var post = await _context.Posts.FirstOrDefaultAsync(x => x.Url.Equals(url));
            if (null == post)
            {
                response.Msg = $"URL：{url} 不存在";
                return response;
            }

            var category = await _context.Categories.FirstOrDefaultAsync(x => x.Id == post.CategoryId);
            var tags = (from post_tags in await _context.PostTags.ToListAsync()
                        join tag in await _context.Tags.ToListAsync()
                        on post_tags.TagId equals tag.Id
                        where post_tags.PostId.Equals(post.Id)
                        select new TagDto
                        {
                            TagName = tag.TagName,
                            DisplayName = tag.DisplayName
                        }).ToList();
            var previous = await _context.Posts
                                         .Where(x => x.CreationTime > post.CreationTime)
                                         .Take(1)
                                         .FirstOrDefaultAsync();
            var next = await _context.Posts
                                     .Where(x => x.CreationTime < post.CreationTime)
                                     .OrderByDescending(x => x.CreationTime)
                                     .Take(1)
                                     .FirstOrDefaultAsync();
            var result = new GetPostDto
            {
                Title = post.Title,
                Author = post.Author,
                Url = post.Url,
                Html = post.Html,
                Markdown = post.Markdown,
                CreationTime = post.CreationTime.ToDateTimeForEn(),
                Category = new CategoryDto
                {
                    CategoryName = category.CategoryName,
                    DisplayName = category.DisplayName
                },
                Tags = tags,
                Previous = previous == null ? null : new PostForPagedDto
                {
                    Title = previous.Title,
                    Url = previous.Url
                },
                Next = next == null ? null : new PostForPagedDto
                {
                    Title = next.Title,
                    Url = next.Url
                }
            };

            response.Result = result;
            return response;
        }

        /// <summary>
        /// 分页查询文章列表
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("post/query")]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "page", "limit" })]
        public async Task<PagedResponse<QueryPostDto>> QueryPostsAsync([FromQuery] PagingInput input)
        {
            var posts = await _context.Posts.ToListAsync();
            var count = posts.Count;

            var result = posts.OrderByDescending(x => x.CreationTime)
                              .Skip((input.Page - 1) * input.Limit)
                              .Take(input.Limit)
                              .Select(x => new PostBriefDto
                              {
                                  Title = x.Title,
                                  Url = x.Url,
                                  Year = x.CreationTime.Year,
                                  CreationTime = x.CreationTime.ToDateTimeForEn()
                              })
                              .GroupBy(x => x.Year)
                              .SelectToList(x => new QueryPostDto
                              {
                                  Year = x.Key,
                                  Posts = x.ToList()
                              });
            return new PagedResponse<QueryPostDto>(count, result);
        }

        /// <summary>
        /// 通过标签名称查询文章列表
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("post/query_by_tag")]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "name" })]
        public async Task<Response<IList<QueryPostDto>>> QueryPostsByTagAsync(string name)
        {
            return new Response<IList<QueryPostDto>>
            {
                Result = (from post_tags in await _context.PostTags.ToListAsync()
                          join tags in await _context.Tags.ToListAsync()
                          on post_tags.TagId equals tags.Id
                          join posts in await _context.Posts.ToListAsync()
                          on post_tags.PostId equals posts.Id
                          where tags.DisplayName.Equals(name)
                          orderby posts.CreationTime descending
                          select new PostBriefDto
                          {
                              Title = posts.Title,
                              Url = posts.Url,
                              CreationTime = posts.CreationTime.ToDateTimeForEn(),
                              Year = posts.CreationTime.Year
                          })
                          .GroupBy(x => x.Year)
                          .SelectToList(x => new QueryPostDto
                          {
                              Year = x.Key,
                              Posts = x.ToList()
                          })
            };
        }

        /// <summary>
        /// 通过分类名称查询文章列表
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("post/query_by_category")]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "name" })]
        public async Task<Response<IList<QueryPostDto>>> QueryPostsByCategoryAsync(string name)
        {
            return new Response<IList<QueryPostDto>>
            {
                Result = (from posts in await _context.Posts.ToListAsync()
                          join categories in await _context.Categories.ToListAsync()
                          on posts.CategoryId equals categories.Id
                          where categories.DisplayName.Equals(name)
                          orderby posts.CreationTime descending
                          select new PostBriefDto
                          {
                              Title = posts.Title,
                              Url = posts.Url,
                              CreationTime = posts.CreationTime.ToDateTimeForEn(),
                              Year = posts.CreationTime.Year
                          })
                          .GroupBy(x => x.Year)
                          .SelectToList(x => new QueryPostDto
                          {
                              Year = x.Key,
                              Posts = x.ToList()
                          })
            };
        }

        #endregion Posts

        #region Tags

        /// <summary>
        /// 获取标签名称
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("tag")]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "name" })]
        public async Task<Response<string>> GetTagAsync(string name)
        {
            var response = new Response<string>();

            var tag = await _context.Tags.FirstOrDefaultAsync(x => x.DisplayName.Equals(name));
            if (null == tag)
            {
                response.Msg = $"标签：{name} 不存在";
                return response;
            }

            response.Result = tag.TagName;
            return response;
        }

        /// <summary>
        /// 查询标签列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("tags")]
        [ResponseCache(CacheProfileName = "default")]
        public async Task<Response<IList<QueryTagDto>>> QueryTagsAsync()
        {
            return new Response<IList<QueryTagDto>>
            {
                Result = (from tags in await _context.Tags.ToListAsync()
                          join post_tags in await _context.PostTags.ToListAsync()
                          on tags.Id equals post_tags.TagId
                          group tags by new
                          {
                              tags.TagName,
                              tags.DisplayName
                          } into g
                          select new QueryTagDto
                          {
                              TagName = g.Key.TagName,
                              DisplayName = g.Key.DisplayName,
                              Count = g.Count()
                          }).ToList()
            };
        }

        #endregion Tags

        #region Categories

        /// <summary>
        /// 获取分类名称
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("category")]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "name" })]
        public async Task<Response<string>> GetCategoryAsync(string name)
        {
            var response = new Response<string>();

            var category = await _context.Categories.FirstOrDefaultAsync(x => x.DisplayName.Equals(name));
            if (null == category)
            {
                response.Msg = $"分类：{name} 不存在";
                return response;
            }

            response.Result = category.CategoryName;
            return response;
        }

        /// <summary>
        /// 查询分类列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("categories")]
        [ResponseCache(CacheProfileName = "default")]
        public async Task<Response<IList<QueryCategoryDto>>> QueryCategoriesAsync()
        {
            return new Response<IList<QueryCategoryDto>>
            {
                Result = (from category in await _context.Categories.ToListAsync()
                          join posts in await _context.Posts.ToListAsync()
                          on category.Id equals posts.CategoryId
                          group category by new
                          {
                              category.CategoryName,
                              category.DisplayName
                          } into g
                          select new QueryCategoryDto
                          {
                              CategoryName = g.Key.CategoryName,
                              DisplayName = g.Key.DisplayName,
                              Count = g.Count()
                          }).ToList()
            };
        }

        #endregion Categories

        #region FriendLink

        /// <summary>
        /// 查询友链列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("friendlinks")]
        [ResponseCache(CacheProfileName = "default")]
        public async Task<Response<IList<FriendLinkDto>>> QueryFriendLinksAsync()
        {
            var response = new Response<IList<FriendLinkDto>>();

            var links = await _context.FriendLinks.ToListAsync();
            var result = links.SelectToList(x => new FriendLinkDto
            {
                Title = x.Title,
                LinkUrl = x.LinkUrl
            });

            response.Result = result;
            return response;
        }

        #endregion FriendLink

        #region RSS

        /// <summary>
        /// 生成RSS
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("/rss")]
        public async Task<IActionResult> GenerateRssAsync()
        {
            var list = (from posts in await _context.Posts.ToListAsync()
                        join categories in await _context.Categories.ToListAsync()
                        on posts.CategoryId equals categories.Id
                        orderby posts.CreationTime descending
                        select new PostRssDto
                        {
                            Title = posts.Title,
                            Link = posts.Url,
                            Description = posts.Html.ReplaceHtml(),
                            Author = posts.Author,
                            Category = categories.CategoryName,
                            PubDate = posts.CreationTime
                        }).ToList();

            var document = new XDocument(
                new XDeclaration(version: "2.0", encoding: "utf-8", standalone: "no"),
                new XElement("rss", new XAttribute("version", "2.0"),
                    new XElement("channel",
                        new XElement("title", "阿星Plus"),
                        new XElement("description", "生命不息，奋斗不止"),
                        new XElement("link", "https://meowv.com"),

                        from item in list
                        select

                        new XElement("item",
                            new XElement("title", item.Title),
                            new XElement("link", $"https://meowv.com/post{item.Link}"),
                            new XElement("description", item.Description),
                            new XElement("author", item.Author),
                            new XElement("category", item.Category),
                            new XElement("pubdate", item.PubDate)
                        )
                    )
                )
            );

            return new ContentResult
            {
                Content = document.ToString(),
                ContentType = "text/xml",
                StatusCode = 200
            };
        }

        #endregion RSS
    }
}