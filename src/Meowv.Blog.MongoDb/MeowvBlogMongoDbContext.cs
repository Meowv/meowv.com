using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.News;
using MongoDB.Driver;
using Volo.Abp.MongoDB;
using Tag = Meowv.Blog.Domain.Blog.Tag;

namespace Meowv.Blog
{
    public class MeowvBlogMongoDbContext : AbpMongoDbContext
    {
        public IMongoCollection<Post> Posts => Collection<Post>();

        public IMongoCollection<Category> Categories => Collection<Category>();

        public IMongoCollection<Tag> Tags => Collection<Tag>();

        public IMongoCollection<FriendLink> FriendLinks => Collection<FriendLink>();

        public IMongoCollection<Hot> Hots => Collection<Hot>();

        protected override void CreateModel(IMongoModelBuilder modelBuilder)
        {
            base.CreateModel(modelBuilder);

            modelBuilder.Configure();
        }
    }
}