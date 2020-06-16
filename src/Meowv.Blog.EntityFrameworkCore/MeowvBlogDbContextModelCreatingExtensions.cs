using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.Gallery;
using Meowv.Blog.Domain.HotNews;
using Meowv.Blog.Domain.Shared;
using Meowv.Blog.Domain.Signature;
using Meowv.Blog.Domain.Soul;
using Meowv.Blog.Domain.Wallpaper;
using Microsoft.EntityFrameworkCore;
using Volo.Abp;
using static Meowv.Blog.Domain.Shared.MeowvBlogDbConsts;

namespace Meowv.Blog.EntityFrameworkCore
{
    public static class MeowvBlogDbContextModelCreatingExtensions
    {
        public static void Configure(this ModelBuilder builder)
        {
            Check.NotNull(builder, nameof(builder));

            builder.Entity<Post>(b =>
            {
                b.ToTable(MeowvBlogConsts.DbTablePrefix + DbTableName.Posts);
                b.HasKey(x => x.Id);
                b.Property(x => x.Title).HasMaxLength(200).IsRequired();
                b.Property(x => x.Author).HasMaxLength(10);
                b.Property(x => x.Url).HasMaxLength(100).IsRequired();
                b.Property(x => x.Html).HasColumnType("longtext").IsRequired();
                b.Property(x => x.Markdown).HasColumnType("longtext").IsRequired();
                b.Property(x => x.CategoryId).HasColumnType("int");
                b.Property(x => x.CreationTime).HasColumnType("datetime");
            });

            builder.Entity<Category>(b =>
            {
                b.ToTable(MeowvBlogConsts.DbTablePrefix + DbTableName.Categories);
                b.HasKey(x => x.Id);
                b.Property(x => x.CategoryName).HasMaxLength(50).IsRequired();
                b.Property(x => x.DisplayName).HasMaxLength(50).IsRequired();
            });

            builder.Entity<Tag>(b =>
            {
                b.ToTable(MeowvBlogConsts.DbTablePrefix + DbTableName.Tags);
                b.HasKey(x => x.Id);
                b.Property(x => x.TagName).HasMaxLength(50).IsRequired();
                b.Property(x => x.DisplayName).HasMaxLength(50).IsRequired();
            });

            builder.Entity<PostTag>(b =>
            {
                b.ToTable(MeowvBlogConsts.DbTablePrefix + DbTableName.PostTags);
                b.HasKey(x => x.Id);
                b.Property(x => x.PostId).HasColumnType("int").IsRequired();
                b.Property(x => x.TagId).HasColumnType("int").IsRequired();
            });

            builder.Entity<FriendLink>(b =>
            {
                b.ToTable(MeowvBlogConsts.DbTablePrefix + DbTableName.Friendlinks);
                b.HasKey(x => x.Id);
                b.Property(x => x.Title).HasMaxLength(20).IsRequired();
                b.Property(x => x.LinkUrl).HasMaxLength(100).IsRequired();
            });

            builder.Entity<Wallpaper>(b =>
            {
                b.ToTable(MeowvBlogConsts.DbTablePrefix + DbTableName.Wallpapers);
                b.HasKey(x => x.Id);
                b.Property(x => x.Id).ValueGeneratedOnAdd();
                b.Property(x => x.Url).HasMaxLength(200).IsRequired();
                b.Property(x => x.Title).HasMaxLength(100).IsRequired();
                b.Property(x => x.Type).HasColumnType("int").IsRequired();
                b.Property(x => x.CreateTime).HasColumnType("datetime").IsRequired();
            });

            builder.Entity<HotNews>(b =>
            {
                b.ToTable(MeowvBlogConsts.DbTablePrefix + DbTableName.HotNews);
                b.HasKey(x => x.Id);
                b.Property(x => x.Id).ValueGeneratedOnAdd();
                b.Property(x => x.Title).HasMaxLength(200).IsRequired();
                b.Property(x => x.Url).HasMaxLength(250).IsRequired();
                b.Property(x => x.SourceId).HasColumnType("int").IsRequired();
                b.Property(x => x.CreateTime).HasColumnType("datetime").IsRequired();
            });

            builder.Entity<Signature>(b =>
            {
                b.ToTable(MeowvBlogConsts.DbTablePrefix + DbTableName.Signatures);
                b.HasKey(x => x.Id);
                b.Property(x => x.Id).ValueGeneratedOnAdd();
                b.Property(x => x.Name).HasMaxLength(20).IsRequired();
                b.Property(x => x.Type).HasMaxLength(20).IsRequired();
                b.Property(x => x.Url).HasMaxLength(100).IsRequired();
                b.Property(x => x.Ip).HasMaxLength(50).IsRequired();
                b.Property(x => x.CreateTime).HasColumnType("datetime");
            });

            builder.Entity<ChickenSoup>(b =>
            {
                b.ToTable(MeowvBlogConsts.DbTablePrefix + DbTableName.ChickenSoups);
                b.HasKey(x => x.Id);
                b.Property(x => x.Id).ValueGeneratedOnAdd();
                b.Property(x => x.Content).HasMaxLength(200).IsRequired();
            });

            builder.Entity<Album>(b =>
            {
                b.ToTable(MeowvBlogConsts.DbTablePrefix + DbTableName.Albums);
                b.HasKey(x => x.Id);
                b.Property(x => x.Name).HasMaxLength(100).IsRequired();
                b.Property(x => x.ImgUrl).HasMaxLength(200).IsRequired();
                b.Property(x => x.IsPublic).HasColumnType("bool").IsRequired();
                b.Property(x => x.Password).HasMaxLength(20).IsRequired();
                b.Property(x => x.CreateTime).HasColumnType("datetime").IsRequired();
            });

            builder.Entity<Image>(b =>
            {
                b.ToTable(MeowvBlogConsts.DbTablePrefix + DbTableName.Images);
                b.HasKey(x => x.Id);
                b.Property(x => x.AlbumId).HasColumnType("Guid").IsRequired();
                b.Property(x => x.ImgUrl).HasMaxLength(200).IsRequired();
                b.Property(x => x.Width).HasColumnType("int").IsRequired();
                b.Property(x => x.Height).HasColumnType("int").IsRequired();
                b.Property(x => x.CreateTime).HasColumnType("datetime").IsRequired();
            });
        }
    }
}