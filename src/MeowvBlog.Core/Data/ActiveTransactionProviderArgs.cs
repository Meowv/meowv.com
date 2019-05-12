using System.Collections.Generic;

namespace MeowvBlog.Core.Data
{
    public class ActiveTransactionProviderArgs : Dictionary<string, object>
    {
        public static ActiveTransactionProviderArgs Empty
        {
            get;
        } = new ActiveTransactionProviderArgs();
    }
}