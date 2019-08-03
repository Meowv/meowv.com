using MeowvBlog.Signature;
using Plus;
using Plus.CodeAnnotations;
using Plus.Services;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Sign.Impl
{
    public class SignService : ApplicationServiceBase, ISignService
    {
        // <summary>
        /// 获取所有签名的类型
        /// </summary>
        /// <returns></returns>
        public async Task<IList<NameValue<int>>> GetSignType()
        {
            var list = new List<NameValue<int>>();

            foreach (SignatureEnum value in Enum.GetValues(typeof(SignatureEnum)))
            {
                list.Add(new NameValue<int>() { Name = value.ToAlias(), Value = (int)value });
            }
            return await Task.FromResult(list);
        }
    }
}