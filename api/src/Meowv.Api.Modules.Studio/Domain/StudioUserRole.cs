using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Domain;

[JsonConverter(typeof(StudioEnumConverter<StudioUserRole>))]
public enum StudioUserRole
{
    User,
    Pro,
    Admin
}