using MeowvBlog.Services.Dto.Signature;
using MeowvBlog.Signature;
using Plus;
using Plus.CodeAnnotations;
using Plus.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Signature.Impl
{
    public class SignatureService : ApplicationServiceBase, ISignatureService
    {
        private readonly SignatureLogService _signatureLogService;

        public SignatureService(SignatureLogService signatureLogService)
        {
            _signatureLogService = signatureLogService;
        }

        /// <summary>
        /// 获取所有签名的类型
        /// </summary>
        /// <returns></returns>
        public async Task<IList<NameValue<int>>> GetSignatureType()
        {
            var list = new List<NameValue<int>>();

            foreach (SignatureEnum value in Enum.GetValues(typeof(SignatureEnum)))
            {
                list.Add(new NameValue<int>() { Name = value.ToAlias(), Value = (int)value });
            }
            return await Task.FromResult(list);
        }

        /// <summary>
        /// 获取签名
        /// </summary>
        /// <param name="name"></param>
        /// <param name="id"></param>
        /// <param name="ip"></param>
        /// <param name="from"></param>
        /// <returns></returns>
        public async Task<string> GetSignature(string name, int id, string ip, string from = "")
        {
            var url = await name.GenerateSignature(id, from);

            if (url.IsNotNullOrEmpty())
            {
                await _signatureLogService.InsertSignatureLog(new SignatureLogDto
                {
                    Name = name,
                    Type = GetSignatureType().Result.Where(x => x.Value == id).FirstOrDefault().Name,
                    Url = url,
                    Ip = ip
                });
            }

            return url;
        }
    }
}