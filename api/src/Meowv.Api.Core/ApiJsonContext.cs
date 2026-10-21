using System.Text.Json;
using System.Text.Json.Serialization;

namespace Meowv.Api.Core;

[JsonSourceGenerationOptions(JsonSerializerDefaults.Web)]
[JsonSerializable(typeof(ModuleDescriptor))]
[JsonSerializable(typeof(ModuleDescriptor[]))]
[JsonSerializable(typeof(EndpointDescriptor[]))]
public sealed partial class ApiJsonContext : JsonSerializerContext;
