using AutoMapper;
using AutoMapper.EquivalencyExpression;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System;
using System.Collections.Generic;

namespace MeowvBlog.AutoMapper.Tests
{
    [TestClass]
    public class AutoMapper_Tests
    {
        private readonly IMapper _mapper;

        public AutoMapper_Tests()
        {
            var config = new MapperConfiguration(configuration =>
            {
                configuration.CreateAutoAttributeMaps(typeof(Post));
                configuration.AddCollectionMappers();
            });

            _mapper = config.CreateMapper();
        }

        [TestMethod]
        public void Mapper_1_Test()
        {
            var post = new Post
            {
                Id = 1,
                Title = "Talk is sheap,show me the code.",
                Author = "阿星Plus",
                CreationTime = DateTime.Now
            };

            var dto = _mapper.Map<PostDto>(post);
            Console.WriteLine(dto.SerializeToJson());

            var dto2 = post.MapTo<PostDto>();
            Console.WriteLine(dto2.SerializeToJson());
        }

        [TestMethod]
        public void Mapper_2_Test()
        {
            var posts = new List<Post>
            {
                new Post
                {
                    Id = 1,
                    Title = "Talk is sheap,show me the code.",
                    Author = "阿星Plus",
                    CreationTime = DateTime.Now
                },
                new Post
                {
                    Id = 2,
                    Title = "Talk is sheap,show me the code.",
                    Author = "阿星Plus",
                    CreationTime = DateTime.Now
                }
            };

            var dtos = _mapper.Map<IList<PostDto>>(posts);
            Console.WriteLine(dtos.SerializeToJson());

            var dtos2 = posts.MapTo<List<PostDto>>();
            Console.WriteLine(dtos2.SerializeToJson());
        }

        #region Class

        [AutoMap(typeof(PostDto))]
        private class Post
        {
            public int Id { get; set; }

            public string Title { get; set; }

            public string Author { get; set; }

            public DateTime? CreationTime { get; set; }
        }

        private class PostDto
        {
            public int Id { get; set; }

            public string Title { get; set; }

            public string Author { get; set; }
        }

        #endregion
    }
}