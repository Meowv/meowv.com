namespace Meowv.Api.Core;

/// <summary>凭据读取结果；<see cref="FromQuery" /> 表示凭据来自 URL 查询参数。</summary>
public readonly record struct ApiCredential(ApiCredentialState State, string? Value, bool FromQuery)
{
    public bool Present => State != ApiCredentialState.Missing;
}