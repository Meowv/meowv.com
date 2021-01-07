using Meowv.Blog.Domain.Blog;
using MongoDB.Driver;
using Volo.Abp.Data;
using Volo.Abp.MongoDB;
using Tag = Meowv.Blog.Domain.Blog.Tag;

namespace Meowv.Blog
{
    [ConnectionStringName("mongodb")]
    public class MeowvBlogMongoDbContext : AbpMongoDbContext
    {
        public IMongoCollection<Post> Posts => Collection<Post>();

        public IMongoCollection<Category> Categories => Collection<Category>();

        public IMongoCollection<Tag> Tags => Collection<Tag>();

        public IMongoCollection<FriendLink> FriendLinks => Collection<FriendLink>();

        protected override void CreateModel(IMongoModelBuilder modelBuilder)
        {
            base.CreateModel(modelBuilder);

            modelBuilder.Configure();
        }
    }
}