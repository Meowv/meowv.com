using System.Text.Json;
using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Domain;

public sealed class StudioEnumConverter<TEnum> : JsonConverter<TEnum>
    where TEnum : struct, Enum
{
    public override TEnum Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String)
            throw new JsonException($"Enum {typeof(TEnum).Name} must be a string.");

        var text = reader.GetString();
        if (!Enum.TryParse<TEnum>(text, true, out var value) || !Enum.IsDefined(value))
            throw new JsonException($"Unknown {typeof(TEnum).Name} value '{text}'.");

        return value;
    }

    public override void Write(Utf8JsonWriter writer, TEnum value, JsonSerializerOptions options)
    {
        var name = value.ToString();
        var wire = string.Equals(name, "XLarge", StringComparison.Ordinal)
            ? "xlarge"
            : JsonNamingPolicy.CamelCase.ConvertName(name);
        writer.WriteStringValue(wire);
    }
}