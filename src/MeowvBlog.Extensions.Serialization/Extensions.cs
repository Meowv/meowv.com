using Newtonsoft.Json;
using System.IO;
using System.Runtime.Serialization.Formatters.Binary;
using System.Text;
using System.Xml.Serialization;

/// <summary>
/// Serialization.Extensions
/// </summary>
public static class Extensions
{
    /// <summary>
    /// SerializeBinary
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="this"></param>
    /// <returns></returns>
    public static string SerializeBinary<T>(this T @this)
    {
        BinaryFormatter binaryFormatter = new BinaryFormatter();
        using (MemoryStream memoryStream = new MemoryStream())
        {
            binaryFormatter.Serialize(memoryStream, @this);
            return Encoding.Default.GetString(memoryStream.ToArray());
        }
    }

    /// <summary>
    /// SerializeBinary
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="this"></param>
    /// <param name="encoding"></param>
    /// <returns></returns>
    public static string SerializeBinary<T>(this T @this, Encoding encoding)
    {
        BinaryFormatter binaryFormatter = new BinaryFormatter();
        using (MemoryStream memoryStream = new MemoryStream())
        {
            binaryFormatter.Serialize(memoryStream, @this);
            return encoding.GetString(memoryStream.ToArray());
        }
    }

    /// <summary>
    /// SerializeToJson
    /// </summary>
    /// <param name="input"></param>
    /// <returns></returns>
    public static string SerializeToJson(this object input)
    {
        return JsonConvert.SerializeObject(input);
    }

    /// <summary>
    /// SerializeXml
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static string SerializeXml(this object @this)
    {
        XmlSerializer xmlSerializer = new XmlSerializer(@this.GetType());
        using (StringWriter stringWriter = new StringWriter())
        {
            xmlSerializer.Serialize(stringWriter, @this);
            using (StringReader stringReader = new StringReader(stringWriter.GetStringBuilder().ToString()))
            {
                return stringReader.ReadToEnd();
            }
        }
    }

    /// <summary>
    /// DeserializeBinary
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="this"></param>
    /// <returns></returns>
    public static T DeserializeBinary<T>(this string @this)
    {
        using (MemoryStream serializationStream = new MemoryStream(Encoding.Default.GetBytes(@this)))
        {
            BinaryFormatter binaryFormatter = new BinaryFormatter();
            return (T)binaryFormatter.Deserialize(serializationStream);
        }
    }

    /// <summary>
    /// DeserializeBinary
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="this"></param>
    /// <param name="encoding"></param>
    /// <returns></returns>
    public static T DeserializeBinary<T>(this string @this, Encoding encoding)
    {
        using (MemoryStream serializationStream = new MemoryStream(encoding.GetBytes(@this)))
        {
            BinaryFormatter binaryFormatter = new BinaryFormatter();
            return (T)binaryFormatter.Deserialize(serializationStream);
        }
    }

    /// <summary>
    /// DeserializeFromJson
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="input"></param>
    /// <returns></returns>
    public static T DeserializeFromJson<T>(this string input)
    {
        return JsonConvert.DeserializeObject<T>(input);
    }

    /// <summary>
    /// DeserializeFromJson
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="input"></param>
    /// <returns></returns>
    public static T DeserializeFromJson<T>(this object input)
    {
        return JsonConvert.DeserializeObject<T>(input.ToString());
    }

    /// <summary>
    /// DeserializeXml
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="this"></param>
    /// <returns></returns>
    public static T DeserializeXml<T>(this string @this)
    {
        XmlSerializer xmlSerializer = new XmlSerializer(typeof(T));
        StringReader textReader = new StringReader(@this);
        return (T)xmlSerializer.Deserialize(textReader);
    }
}