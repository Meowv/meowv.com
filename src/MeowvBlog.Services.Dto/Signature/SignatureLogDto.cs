using MeowvBlog.Core.Domain.Signature;
using Plus.AutoMapper;
using System;

namespace MeowvBlog.Services.Dto.Signature
{
    [AutoMapFrom(typeof(SignatureLog))]
    public class SignatureLogDto
    {
        public string Name { get; set; }

        public string Type { get; set; }

        public string Url { get; set; }

        public string Ip { get; set; }

        public string Time { get; set; }
    }
}