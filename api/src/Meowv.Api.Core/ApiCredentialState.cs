namespace Meowv.Api.Core;

/// <summary>一次凭据读取的结果。</summary>
public enum ApiCredentialState
{
    /// <summary>请求未携带该凭据。</summary>
    Missing,

    /// <summary>凭据已携带且格式合法，仍需业务侧校验。</summary>
    Valid,

    /// <summary>两种载体同时出现、重复出现或格式不合法。</summary>
    Invalid
}