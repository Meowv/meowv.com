using Plus;
using Plus.Domain.Uow;
using Plus.Services;
using System;

namespace MeowvBlog.Services
{
    public abstract class ServiceBase : ApplicationServiceBase
    {
        public IUnitOfWorkManager UnitOfWorkManager;

        protected ServiceBase()
        {
            UnitOfWorkManager = PlusEngine.Instance.Resolve<IUnitOfWorkManager>();
        }

        /// <summary>
        /// 19位纯数字GUID
        /// </summary>
        /// <returns></returns>
        public string GenerateGuid()
        {
            byte[] buffer = Guid.NewGuid().ToByteArray();
            return BitConverter.ToInt64(buffer, 0).ToString();
        }
    }
}