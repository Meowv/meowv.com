using MeowvBlog.CodeAnnotations;

namespace MeowvBlog.Response
{
    public enum ResponseStatusCode
    {
        [EnumAlias("错误消息返回")]
        Error = 0,

        [EnumAlias("成功返回")]
        Success = 1,

        [EnumAlias("服务器内部错误")]
        InternalServerError = 100,
    }
}