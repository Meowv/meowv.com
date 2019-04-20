using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using System;

namespace MeowvBlog.Services.Dto
{
    public class DateTimeConverter : DateTimeConverterBase
    {
        private readonly IsoDateTimeConverter converter;

        public DateTimeConverter()
        {
            converter = new IsoDateTimeConverter { DateTimeFormat = "yyyy-MM-dd HH:mm:ss" };
        }

        public override object ReadJson(JsonReader reader, Type objectType, object existingValue, JsonSerializer serializer)
        {
            return converter.ReadJson(reader, objectType, existingValue, serializer);
        }

        public override void WriteJson(JsonWriter writer, object value, JsonSerializer serializer)
        {
            converter.WriteJson(writer, value, serializer);
        }
    }
}