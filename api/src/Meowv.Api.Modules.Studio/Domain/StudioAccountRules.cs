using System.Text.RegularExpressions;

namespace Meowv.Api.Modules.Studio.Domain;

public static partial class StudioAccountRules
{
    public const int UsernameMinLength = 4;
    public const int UsernameMaxLength = 15;
    public const int PasswordMinLength = 6;
    public const int AdminPasswordMinLength = 12;
    public const int PasswordMaxLength = 200;
    public const int EmailMaxLength = 254;

    [GeneratedRegex(@"^[\p{L}\p{N}_-]+$")]
    private static partial Regex UsernamePattern();

    [GeneratedRegex(@"^[^@\s]+@[^@\s.]+\.[^@\s]+$")]
    private static partial Regex EmailPattern();

    public static string NormaliseEmail(string email)
    {
        return email.Trim().ToLowerInvariant();
    }

    public static string NormaliseUsername(string username)
    {
        return username.Trim();
    }

    public static string? ValidateUsername(string username)
    {
        var value = NormaliseUsername(username);
        if (value.Length is < UsernameMinLength or > UsernameMaxLength)
            return $"用户名长度需在 {UsernameMinLength}–{UsernameMaxLength} 个字符之间。";

        return UsernamePattern().IsMatch(value)
            ? null
            : "用户名只能包含字母、数字、下划线、连字符或中日韩文字。";
    }

    public static string? ValidateEmail(string email)
    {
        var value = NormaliseEmail(email);
        if (value.Length is 0 or > EmailMaxLength) return "请输入有效的邮箱地址。";
        return EmailPattern().IsMatch(value) ? null : "请输入有效的邮箱地址。";
    }

    public static string? ValidatePassword(string password, int minimumLength = PasswordMinLength)
    {
        if (password.Length < minimumLength) return $"密码至少需要 {minimumLength} 个字符。";
        if (password.Length > PasswordMaxLength) return $"密码不能超过 {PasswordMaxLength} 个字符。";
        return null;
    }

    public static bool IsPlausibleIdentifier(string identifier)
    {
        var value = identifier.Trim();
        return value.Length is >= UsernameMinLength and <= EmailMaxLength;
    }

    public static string ToWire(StudioUserRole role)
    {
        return role switch
        {
            StudioUserRole.Admin => "admin",
            StudioUserRole.Pro => "pro",
            _ => "user"
        };
    }

    public static StudioUserRole? ParseRole(string? value)
    {
        return value?.Trim().ToLowerInvariant() switch
        {
            "user" => StudioUserRole.User,
            "pro" => StudioUserRole.Pro,
            "admin" => StudioUserRole.Admin,
            _ => null
        };
    }
}