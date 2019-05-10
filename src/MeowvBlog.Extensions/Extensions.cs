using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Dynamic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Linq.Expressions;
using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web;

/// <summary>
/// Extensions
/// </summary>
public static class Extensions
{
    #region A

    /// <summary>
    /// AddIfNotContains
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="source"></param>
    /// <param name="item"></param>
    /// <returns></returns>
    public static bool AddIfNotContains<T>(this ICollection<T> source, T item)
    {
        if (source.IsNotNullOrEmpty())
        {
            if (source.Contains(item))
            {
                return false;
            }
            source.Add(item);
            return true;
        }
        return false;
    }

    /// <summary>
    /// AppendIf
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="this"></param>
    /// <param name="predicate"></param>
    /// <param name="values"></param>
    /// <returns></returns>
    public static StringBuilder AppendIf<T>(this StringBuilder @this, Func<T, bool> predicate, params T[] values)
    {
        foreach (T val in values)
        {
            if (predicate(val))
            {
                @this.Append(val);
            }
        }
        return @this;
    }

    /// <summary>
    /// AppendLineFormat
    /// </summary>
    /// <param name="this"></param>
    /// <param name="format"></param>
    /// <param name="args"></param>
    /// <returns></returns>
    public static StringBuilder AppendLineFormat(this StringBuilder @this, string format, List<IEnumerable<object>> args)
    {
        @this.AppendLine(string.Format(format, args));
        return @this;
    }

    /// <summary>
    /// AppendLineFormat
    /// </summary>
    /// <param name="this"></param>
    /// <param name="format"></param>
    /// <param name="args"></param>
    /// <returns></returns>
    public static StringBuilder AppendLineFormat(this StringBuilder @this, string format, params object[] args)
    {
        @this.AppendLine(string.Format(format, args));
        return @this;
    }

    /// <summary>
    /// AppendLineIf
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="this"></param>
    /// <param name="predicate"></param>
    /// <param name="values"></param>
    /// <returns></returns>
    public static StringBuilder AppendLineIf<T>(this StringBuilder @this, Func<T, bool> predicate, params T[] values)
    {
        for (int i = 0; i < values.Length; i++)
        {
            T arg = values[i];
            if (predicate(arg))
            {
                @this.AppendLine(arg.ToString());
            }
        }
        return @this;
    }

    /// <summary>
    /// As
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="obj"></param>
    /// <returns></returns>
    public static T As<T>(this object obj) where T : class
    {
        return (T)obj;
    }

    /// <summary>
    /// ArrayToString:把数组转为逗号连接的字符串
    /// </summary>
    /// <param name="collection"></param>
    /// <returns></returns>
    public static string ArrayToString(this IEnumerable collection)
    {
        string resStr = "";
        foreach (var item in collection)
        {
            if (resStr != "")
            {
                resStr += ",";
            }
            resStr += item;
        }
        return resStr;
    }

    /// <summary>
    /// ArrayToString:把数组转为split分割后连接的字符串
    /// </summary>
    /// <param name="collection"></param>
    /// <param name="split"></param>
    /// <returns></returns>
    public static string ArrayToString(this IEnumerable collection, string split)
    {
        string resStr = "";
        if (split.IsNullOrEmpty())
        {
            split = ",";
        }
        foreach (var item in collection)
        {
            if (resStr != "")
            {
                resStr += split;
            }
            resStr += item;
        }
        return resStr;
    }

    #endregion

    #region B

    /// <summary>
    /// Between
    /// </summary>
    /// <param name="this"></param>
    /// <param name="minValue"></param>
    /// <param name="maxValue"></param>
    /// <returns></returns>
    public static bool Between(this DateTime @this, DateTime minValue, DateTime maxValue)
    {
        return minValue.CompareTo(@this) == -1 && @this.CompareTo(maxValue) == -1;
    }

    /// <summary>
    /// Br2Nl
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static string Br2Nl(this string @this)
    {
        return @this.Replace("<br />", "\r\n").Replace("<br>", "\r\n");
    }

    #endregion

    #region C

    /// <summary>
    /// CombineApiUrl
    /// </summary>
    /// <param name="host"></param>
    /// <param name="url"></param>
    /// <param name="isSsl"></param>
    /// <returns></returns>
    public static string CombineApiUrl(this string host, string url, bool isSsl = false)
    {
        string returnUrl = "";
        if (host.EndsWith("/"))
        {
            returnUrl = host + url.TrimStart('/');
        }
        else
        {
            returnUrl = host + "/" + url.TrimStart('/');
        }
        isSsl.IfTrue(delegate
        {
            if (!returnUrl.Contains("https://"))
            {
                returnUrl = returnUrl + "https://" + returnUrl;
            }
        }, delegate
        {
            if (!returnUrl.Contains("http://"))
            {
                returnUrl = returnUrl + "http://" + returnUrl;
            }
        });
        return returnUrl;
    }

    /// <summary>
    /// ConcatWith
    /// </summary>
    /// <param name="this"></param>
    /// <param name="values"></param>
    /// <returns></returns>
    public static string ConcatWith(this string @this, params string[] values)
    {
        return @this + values;
    }

    /// <summary>
    /// ConcatWith
    /// </summary>
    /// <param name="str0"></param>
    /// <param name="str1"></param>
    /// <param name="str2"></param>
    /// <param name="str3"></param>
    /// <param name="str4"></param>
    /// <returns></returns>
    public static string ConcatWith(this string str0, string str1, string str2, string str3, string str4)
    {
        return str0 + str1 + str2 + str3 + str4;
    }

    /// <summary>
    /// ConcatWith
    /// </summary>
    /// <param name="str0"></param>
    /// <param name="str1"></param>
    /// <param name="str2"></param>
    /// <param name="str3"></param>
    /// <returns></returns>
    public static string ConcatWith(this string str0, string str1, string str2, string str3)
    {
        return str0 + str1 + str2 + str3;
    }

    /// <summary>
    /// ConcatWith
    /// </summary>
    /// <param name="str0"></param>
    /// <param name="str1"></param>
    /// <param name="str2"></param>
    /// <returns></returns>
    public static string ConcatWith(this string str0, string str1, string str2)
    {
        return str0 + str1 + str2;
    }

    /// <summary>
    /// ConcatWith
    /// </summary>
    /// <param name="str0"></param>
    /// <param name="str1"></param>
    /// <returns></returns>
    public static string ConcatWith(this string str0, string str1)
    {
        return str0 + str1;
    }

    /// <summary>
    /// ContainsAll
    /// </summary>
    /// <param name="this"></param>
    /// <param name="values"></param>
    /// <returns></returns>
    public static bool ContainsAll(this string @this, params string[] values)
    {
        foreach (string value in values)
        {
            if (@this.IndexOf(value) == -1)
            {
                return false;
            }
        }
        return true;
    }

    /// <summary>
    /// ContainsAll
    /// </summary>
    /// <param name="this"></param>
    /// <param name="comparisonType"></param>
    /// <param name="values"></param>
    /// <returns></returns>
    public static bool ContainsAll(this string @this, StringComparison comparisonType, params string[] values)
    {
        foreach (string value in values)
        {
            if (@this.IndexOf(value, comparisonType) == -1)
            {
                return false;
            }
        }
        return true;
    }

    /// <summary>
    /// ContainsAny
    /// </summary>
    /// <param name="this"></param>
    /// <param name="values"></param>
    /// <returns></returns>
    public static bool ContainsAny(this string @this, params string[] values)
    {
        foreach (string value in values)
        {
            if (@this.IndexOf(value) != -1)
            {
                return true;
            }
        }
        return false;
    }

    /// <summary>
    /// ContainsAny
    /// </summary>
    /// <param name="this"></param>
    /// <param name="comparisonType"></param>
    /// <param name="values"></param>
    /// <returns></returns>
    public static bool ContainsAny(this string @this, StringComparison comparisonType, params string[] values)
    {
        foreach (string value in values)
        {
            if (@this.IndexOf(value, comparisonType) != -1)
            {
                return true;
            }
        }
        return false;
    }

    /// <summary>
    /// Copy
    /// </summary>
    /// <param name="str"></param>
    /// <returns></returns>
    public static string Copy(this string str)
    {
        return string.Copy(str);
    }

    /// <summary>
    /// Cut
    /// </summary>
    /// <param name="this"></param>
    /// <param name="maxLength"></param>
    /// <param name="suffix"></param>
    /// <returns></returns>
    public static string Cut(this string @this, int maxLength, string suffix = "...")
    {
        if (@this == null || @this.Length <= maxLength)
        {
            return @this;
        }
        int length = maxLength - suffix.Length;
        return @this.Substring(0, length) + suffix;
    }

    /// <summary>
    /// CutWithCN
    /// </summary>
    /// <param name="p_SrcString"></param>
    /// <param name="p_StartIndex"></param>
    /// <param name="p_Length"></param>
    /// <param name="p_TailString"></param>
    /// <returns></returns>
    public static string CutWithCN(this string p_SrcString, int p_StartIndex, int p_Length, string p_TailString)
    {
        string result = p_SrcString;
        if (p_Length >= 0)
        {
            byte[] bytes = Encoding.Default.GetBytes(p_SrcString);
            if (bytes.Length > p_StartIndex)
            {
                int num = bytes.Length;
                if (bytes.Length > p_StartIndex + p_Length)
                {
                    num = p_Length + p_StartIndex;
                }
                else
                {
                    p_Length = bytes.Length - p_StartIndex;
                    p_TailString = "";
                }
                int num2 = p_Length;
                int[] array = new int[p_Length];
                int num3 = 0;
                for (int i = p_StartIndex; i < num; i++)
                {
                    if (bytes[i] > 127)
                    {
                        num3++;
                        if (num3 == 3)
                        {
                            num3 = 1;
                        }
                    }
                    else
                    {
                        num3 = 0;
                    }
                    array[i] = num3;
                }
                if (bytes[num - 1] > 127 && array[p_Length - 1] == 1)
                {
                    num2 = p_Length + 1;
                }
                byte[] array2 = new byte[num2];
                Array.Copy(bytes, p_StartIndex, array2, 0, num2);
                result = Encoding.Default.GetString(array2);
                result += p_TailString;
            }
        }
        return result;
    }

    /// <summary>
    /// CutWithCN
    /// </summary>
    /// <param name="p_SrcString"></param>
    /// <param name="p_Length"></param>
    /// <param name="p_TailString"></param>
    /// <returns></returns>
    public static string CutWithCN(this string p_SrcString, int p_Length, string p_TailString)
    {
        return p_SrcString.CutWithCN(0, p_Length, p_TailString);
    }

    /// <summary>
    /// CutWithPostfix
    /// </summary>
    /// <param name="str"></param>
    /// <param name="maxLength"></param>
    /// <returns></returns>
    public static string CutWithPostfix(this string str, int maxLength)
    {
        return str.CutWithPostfix(maxLength, "...");
    }

    /// <summary>
    /// CutWithPostfix
    /// </summary>
    /// <param name="str"></param>
    /// <param name="maxLength"></param>
    /// <param name="postfix"></param>
    /// <returns></returns>
    public static string CutWithPostfix(this string str, int maxLength, string postfix)
    {
        if (str == null)
        {
            return null;
        }
        if (str == string.Empty || maxLength == 0)
        {
            return string.Empty;
        }
        if (str.Length <= maxLength)
        {
            return str;
        }
        if (maxLength <= postfix.Length)
        {
            return postfix.Left(maxLength);
        }
        return str.Left(maxLength - postfix.Length) + postfix;
    }

    /// <summary>
    /// ConvertToList:把LinqGroupBy结果转换成指定的集合
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <typeparam name="TResult"></typeparam>
    /// <param name="source"></param>
    /// <param name="where"></param>
    /// <returns></returns>
    public static IEnumerable<TResult> ConvertToList<T, TResult>(this IEnumerable<T> source, Func<T, TResult> where)
    {
        foreach (T item in source)
        {
            yield return where(item);
        }
    }

    #endregion

    #region D

    /// <summary>
    /// DecodeBase64
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static string DecodeBase64(this string @this)
    {
        return Encoding.ASCII.GetString(Convert.FromBase64String(@this));
    }

    /// <summary>
    /// DecodeUTF8Base64
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static string DecodeUTF8Base64(this string @this)
    {
        return Encoding.UTF8.GetString(Convert.FromBase64String(@this));
    }

    /// <summary>
    /// DistinctBy:根据集合中指定的列过滤重复
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <typeparam name="TResult"></typeparam>
    /// <param name="source"></param>
    /// <param name="where"></param>
    /// <returns></returns>
    public static IEnumerable<T> DistinctBy<T, TResult>(this IEnumerable<T> source, Func<T, TResult> where)
    {
        HashSet<TResult> hashSetData = new HashSet<TResult>();
        foreach (T item in source)
        {
            if (hashSetData.Add(where(item)))
            {
                yield return item;
            }
        }
    }

    /// <summary>
    /// DistinctByData:根据集合中指定的列过滤重复,并返回指定的列
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <typeparam name="TResult"></typeparam>
    /// <param name="source"></param>
    /// <param name="where"></param>
    /// <returns></returns>
    public static IEnumerable<TResult> DistinctByData<T, TResult>(this IEnumerable<T> source, Func<T, TResult> where)
    {
        HashSet<TResult> hashSetData = new HashSet<TResult>();
        foreach (T item in source)
        {
            var result = where(item);
            if (hashSetData.Add(result))
            {
                yield return result;
            }
        }
    }

    #endregion

    #region E

    /// <summary>
    /// Elapsed
    /// </summary>
    /// <param name="startTime"></param>
    /// <param name="endTime"></param>
    /// <returns></returns>
    public static TimeSpan Elapsed(this DateTime startTime, DateTime endTime)
    {
        return startTime - endTime;
    }

    /// <summary>
    /// Elapsed
    /// </summary>
    /// <param name="datetime"></param>
    /// <returns></returns>
    public static TimeSpan Elapsed(this DateTime datetime)
    {
        return DateTime.Now - datetime;
    }

    /// <summary>
    /// EncodeBase64
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static string EncodeBase64(this string @this)
    {
        return Convert.ToBase64String(Activator.CreateInstance<ASCIIEncoding>().GetBytes(@this));
    }

    /// <summary>
    /// EncodeUTF8Base64
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static string EncodeUTF8Base64(this string @this)
    {
        return Encoding.UTF8.GetString(Convert.FromBase64String(@this));
    }

    /// <summary>
    /// EndOfDay
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static DateTime EndOfDay(this DateTime @this)
    {
        return new DateTime(@this.Year, @this.Month, @this.Day).AddDays(1.0).Subtract(new TimeSpan(0, 0, 0, 0, 1));
    }

    /// <summary>
    /// EnsureEndsWith
    /// </summary>
    /// <param name="str"></param>
    /// <param name="c"></param>
    /// <returns></returns>
    public static string EnsureEndsWith(this string str, char c)
    {
        return str.EnsureEndsWith(c, StringComparison.InvariantCulture);
    }

    /// <summary>
    /// EnsureEndsWith
    /// </summary>
    /// <param name="str"></param>
    /// <param name="c"></param>
    /// <param name="ignoreCase"></param>
    /// <param name="culture"></param>
    /// <returns></returns>
    public static string EnsureEndsWith(this string str, char c, bool ignoreCase, CultureInfo culture)
    {
        if (str == null)
        {
            throw new ArgumentNullException("str");
        }
        if (str.EndsWith(c.ToString(culture), ignoreCase, culture))
        {
            return str;
        }
        return str + c.ToString();
    }

    /// <summary>
    /// EnsureEndsWith
    /// </summary>
    /// <param name="str"></param>
    /// <param name="c"></param>
    /// <param name="comparisonType"></param>
    /// <returns></returns>
    public static string EnsureEndsWith(this string str, char c, StringComparison comparisonType)
    {
        if (str == null)
        {
            throw new ArgumentNullException("str");
        }
        if (str.EndsWith(c.ToString(CultureInfo.InvariantCulture), comparisonType))
        {
            return str;
        }
        return str + c.ToString();
    }

    /// <summary>
    /// EnsureMaximumLength
    /// </summary>
    /// <param name="str"></param>
    /// <param name="maxLength"></param>
    /// <param name="postfix"></param>
    /// <returns></returns>
    public static string EnsureMaximumLength(this string str, int maxLength, string postfix = null)
    {
        if (str.IsNullOrEmpty())
        {
            return str;
        }
        if (str.Length > maxLength)
        {
            string text = str.Substring(0, maxLength);
            if (!string.IsNullOrEmpty(postfix))
            {
                text += postfix;
            }
            return text;
        }
        return str;
    }

    /// <summary>
    /// EnsureNotNull
    /// </summary>
    /// <param name="str"></param>
    /// <returns></returns>
    public static string EnsureNotNull(this string str)
    {
        if (str == null)
        {
            return string.Empty;
        }
        return str;
    }

    /// <summary>
    /// EnsureNumericOnly
    /// </summary>
    /// <param name="str"></param>
    /// <returns></returns>
    public static string EnsureNumericOnly(this string str)
    {
        if (str.IsNullOrEmpty())
        {
            return string.Empty;
        }
        StringBuilder stringBuilder = new StringBuilder();
        foreach (char c in str)
        {
            if (char.IsDigit(c))
            {
                stringBuilder.Append(c);
            }
        }
        return stringBuilder.ToString();
    }

    /// <summary>
    /// EnsureStartsWith
    /// </summary>
    /// <param name="str"></param>
    /// <param name="c"></param>
    /// <returns></returns>
    public static string EnsureStartsWith(this string str, char c)
    {
        return str.EnsureStartsWith(c, StringComparison.InvariantCulture);
    }

    /// <summary>
    /// EnsureStartsWith
    /// </summary>
    /// <param name="str"></param>
    /// <param name="c"></param>
    /// <param name="comparisonType"></param>
    /// <returns></returns>
    public static string EnsureStartsWith(this string str, char c, StringComparison comparisonType)
    {
        if (str == null)
        {
            throw new ArgumentNullException("str");
        }
        if (str.StartsWith(c.ToString(CultureInfo.InvariantCulture), comparisonType))
        {
            return str;
        }
        return c.ToString() + str;
    }

    /// <summary>
    /// EnsureStartsWith
    /// </summary>
    /// <param name="str"></param>
    /// <param name="c"></param>
    /// <param name="ignoreCase"></param>
    /// <param name="culture"></param>
    /// <returns></returns>
    public static string EnsureStartsWith(this string str, char c, bool ignoreCase, CultureInfo culture)
    {
        if (str == null)
        {
            throw new ArgumentNullException("str");
        }
        if (str.StartsWith(c.ToString(culture), ignoreCase, culture))
        {
            return str;
        }
        return c.ToString() + str;
    }

    /// <summary>
    /// ExistInEnum
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="value"></param>
    /// <returns></returns>
    public static bool ExistInEnum<T>(this int value)
    {
        Type typeFromHandle = typeof(T);
        bool result = false;
        string[] names = Enum.GetNames(typeFromHandle);
        foreach (string value2 in names)
        {
            if (Enum.Format(typeFromHandle, Enum.Parse(typeFromHandle, value2), "d").ToInt() == value)
            {
                result = true;
                break;
            }
        }
        return result;
    }

    #endregion

    #region F

    /// <summary>
    /// For
    /// </summary>
    /// <param name="n"></param>
    /// <param name="action"></param>
    public static void For(this int n, Action<int> action)
    {
        for (int i = 0; i < n; i++)
        {
            action(i);
        }
    }

    /// <summary>
    /// Format
    /// </summary>
    /// <param name="format"></param>
    /// <param name="arg0"></param>
    /// <param name="arg1"></param>
    /// <returns></returns>
    public static string Format(this string format, object arg0, object arg1)
    {
        return string.Format(format, arg0, arg1);
    }

    /// <summary>
    /// Format
    /// </summary>
    /// <param name="format"></param>
    /// <param name="args"></param>
    /// <returns></returns>
    public static string Format(this string format, object[] args)
    {
        return string.Format(format, args);
    }

    /// <summary>
    /// Format
    /// </summary>
    /// <param name="format"></param>
    /// <param name="arg0"></param>
    /// <param name="arg1"></param>
    /// <param name="arg2"></param>
    /// <returns></returns>
    public static string Format(this string format, object arg0, object arg1, object arg2)
    {
        return string.Format(format, arg0, arg1, arg2);
    }

    /// <summary>
    /// Format
    /// </summary>
    /// <param name="format"></param>
    /// <param name="arg0"></param>
    /// <returns></returns>
    public static string Format(this string format, object arg0)
    {
        return string.Format(format, arg0);
    }

    /// <summary>
    /// FormatWith
    /// </summary>
    /// <param name="this"></param>
    /// <param name="values"></param>
    /// <returns></returns>
    public static string FormatWith(this string @this, params object[] values)
    {
        return string.Format(@this, values);
    }

    /// <summary>
    /// FormatWith
    /// </summary>
    /// <param name="this"></param>
    /// <param name="arg0"></param>
    /// <param name="arg1"></param>
    /// <param name="arg2"></param>
    /// <returns></returns>
    public static string FormatWith(this string @this, object arg0, object arg1, object arg2)
    {
        return string.Format(@this, arg0, arg1, arg2);
    }

    /// <summary>
    /// FormatWith
    /// </summary>
    /// <param name="this"></param>
    /// <param name="arg0"></param>
    /// <param name="arg1"></param>
    /// <returns></returns>
    public static string FormatWith(this string @this, object arg0, object arg1)
    {
        return string.Format(@this, arg0, arg1);
    }

    /// <summary>
    /// FormatWith
    /// </summary>
    /// <param name="this"></param>
    /// <param name="arg0"></param>
    /// <returns></returns>
    public static string FormatWith(this string @this, object arg0)
    {
        return string.Format(@this, arg0);
    }

    /// <summary>
    /// FormatTo
    /// </summary>
    /// <param name="this"></param>
    /// <param name="packageStr"></param>
    /// <param name="segmentStr"></param>
    /// <returns></returns>
    public static string FormatTo(this string[] @this, string packageStr = "", string segmentStr = ",")
    {
        StringBuilder stringBuilder = new StringBuilder();
        for (int i = 0; i < @this.Length; i++)
        {
            stringBuilder.Append(packageStr + @this[i] + packageStr);
            if (i < @this.Length - 1)
            {
                stringBuilder.Append(segmentStr);
            }
        }
        return stringBuilder.ToString();
    }

    /// <summary>
    /// FormatTo
    /// </summary>
    /// <param name="this"></param>
    /// <param name="packageStr"></param>
    /// <param name="segmentStr"></param>
    /// <returns></returns>
    public static string FormatTo(this int[] @this, string packageStr = "", string segmentStr = ",")
    {
        StringBuilder stringBuilder = new StringBuilder();
        for (int i = 0; i < @this.Length; i++)
        {
            stringBuilder.Append(packageStr + @this[i].ToString() + packageStr);
            if (i < @this.Length - 1)
            {
                stringBuilder.Append(segmentStr);
            }
        }
        return stringBuilder.ToString();
    }

    /// <summary>
    /// FormatTo
    /// </summary>
    /// <param name="this"></param>
    /// <param name="packageStr"></param>
    /// <param name="segmentStr"></param>
    /// <returns></returns>
    public static string FormatTo(this IList<string> @this, string packageStr = "", string segmentStr = ",")
    {
        StringBuilder sb = new StringBuilder();
        int i = 0;
        @this.ForEach(delegate
        {
            sb.Append(packageStr + @this[i] + packageStr);
            if (i < @this.Count - 1)
            {
                sb.Append(segmentStr);
            }
            i++;
        });
        return sb.ToString();
    }

    /// <summary>
    /// FormatTo
    /// </summary>
    /// <param name="this"></param>
    /// <param name="packageStr"></param>
    /// <param name="segmentStr"></param>
    /// <returns></returns>
    public static string FormatTo(this IList<int> @this, string packageStr = "", string segmentStr = ",")
    {
        StringBuilder sb = new StringBuilder();
        int i = 0;
        @this.ForEach(delegate
        {
            sb.Append(packageStr + @this[i] + packageStr);
            if (i < @this.Count - 1)
            {
                sb.Append(segmentStr);
            }
            i++;
        });
        return sb.ToString();
    }

    /// <summary>
    /// ForEach
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="this"></param>
    /// <param name="func"></param>
    public static void ForEach<T>(this IEnumerable<T> @this, Action<T> func)
    {
        if (@this != null)
        {
            foreach (T item in @this)
            {
                func(item);
            }
        }
    }

    /// <summary>
    /// ForEach
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="this"></param>
    /// <param name="func"></param>
    public static void ForEach<T>(this IList<T> @this, Action<T> func)
    {
        if (@this.IsNotNullOrEmpty())
        {
            foreach (T item in @this)
            {
                func(item);
            }
        }
    }

    /// <summary>
    /// ForEach
    /// </summary>
    /// <param name="this"></param>
    /// <param name="func"></param>
    public static void ForEach(this string[] @this, Action<string> func)
    {
        if (@this.IsNotNullOrEmpty())
        {
            foreach (string obj in @this)
            {
                func(obj);
            }
        }
    }

    /// <summary>
    /// ForEach
    /// </summary>
    /// <param name="this"></param>
    /// <param name="func"></param>
    public static void ForEach(this int[] @this, Action<int> func)
    {
        if (@this.IsNotNullOrEmpty())
        {
            foreach (int obj in @this)
            {
                func(obj);
            }
        }
    }

    #endregion

    #region G

    /// <summary>
    /// GetAssembly
    /// </summary>
    /// <param name="type"></param>
    /// <returns></returns>
    public static Assembly GetAssembly(this Type type)
    {
        return type.GetTypeInfo().Assembly;
    }

    /// <summary>
    /// GetAttribute
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="methodInfo"></param>
    /// <returns></returns>
    public static T GetAttribute<T>(this MethodBase methodInfo) where T : class
    {
        return methodInfo.GetCustomAttribute(typeof(T)) as T;
    }

    /// <summary>
    /// GetDirectoryPathOrNull
    /// </summary>
    /// <param name="assembly"></param>
    /// <returns></returns>
    public static string GetDirectoryPathOrNull(this Assembly assembly)
    {
        string location = assembly.Location;
        return location == null ? null : new FileInfo(location).Directory?.FullName;
    }

    /// <summary>
    /// GetFileName
    /// </summary>
    /// <param name="url"></param>
    /// <returns></returns>
    public static string GetFileName(this string url)
    {
        if (url == null)
        {
            return "";
        }
        string[] array = url.Split(new char[1]
        {
            '/'
        });
        return array[array.Length - 1].Split(new char[1]
        {
            '?'
        })[0];
    }

    /// <summary>
    /// GetIndexAfterNextDoubleQuote
    /// </summary>
    /// <param name="this"></param>
    /// <param name="allowEscape"></param>
    /// <returns></returns>
    public static int GetIndexAfterNextDoubleQuote(this StringBuilder @this, bool allowEscape)
    {
        return @this.GetIndexAfterNextDoubleQuote(0, allowEscape);
    }

    /// <summary>
    /// GetIndexAfterNextDoubleQuote
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static int GetIndexAfterNextDoubleQuote(this StringBuilder @this)
    {
        return @this.GetIndexAfterNextDoubleQuote(0, allowEscape: false);
    }

    /// <summary>
    /// GetIndexAfterNextDoubleQuote
    /// </summary>
    /// <param name="this"></param>
    /// <param name="startIndex"></param>
    /// <returns></returns>
    public static int GetIndexAfterNextDoubleQuote(this StringBuilder @this, int startIndex)
    {
        return @this.GetIndexAfterNextDoubleQuote(startIndex, allowEscape: false);
    }

    /// <summary>
    /// GetIndexAfterNextDoubleQuote
    /// </summary>
    /// <param name="this"></param>
    /// <param name="startIndex"></param>
    /// <param name="allowEscape"></param>
    /// <returns></returns>
    public static int GetIndexAfterNextDoubleQuote(this StringBuilder @this, int startIndex, bool allowEscape)
    {
        while (startIndex < @this.Length)
        {
            char c = @this[startIndex];
            startIndex++;
            char c2;
            if (allowEscape && c == '\\' && startIndex < @this.Length && ((c2 = @this[startIndex]) == '\\' || c2 == '"'))
            {
                startIndex++;
            }
            else if (c == '"')
            {
                return startIndex;
            }
        }
        return startIndex;
    }

    /// <summary>
    /// GetIndexAfterNextSingleQuote
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static int GetIndexAfterNextSingleQuote(this StringBuilder @this)
    {
        return @this.GetIndexAfterNextSingleQuote(0, allowEscape: false);
    }

    /// <summary>
    /// GetIndexAfterNextSingleQuote
    /// </summary>
    /// <param name="this"></param>
    /// <param name="allowEscape"></param>
    /// <returns></returns>
    public static int GetIndexAfterNextSingleQuote(this StringBuilder @this, bool allowEscape)
    {
        return @this.GetIndexAfterNextSingleQuote(0, allowEscape);
    }

    /// <summary>
    /// GetIndexAfterNextSingleQuote
    /// </summary>
    /// <param name="this"></param>
    /// <param name="startIndex"></param>
    /// <returns></returns>
    public static int GetIndexAfterNextSingleQuote(this StringBuilder @this, int startIndex)
    {
        return @this.GetIndexAfterNextSingleQuote(startIndex, allowEscape: false);
    }

    /// <summary>
    /// GetIndexAfterNextSingleQuote
    /// </summary>
    /// <param name="this"></param>
    /// <param name="startIndex"></param>
    /// <param name="allowEscape"></param>
    /// <returns></returns>
    public static int GetIndexAfterNextSingleQuote(this StringBuilder @this, int startIndex, bool allowEscape)
    {
        while (startIndex < @this.Length)
        {
            char c = @this[startIndex];
            startIndex++;
            char c2;
            if (allowEscape && c == '\\' && startIndex < @this.Length && ((c2 = @this[startIndex]) == '\\' || c2 == '\''))
            {
                startIndex++;
            }
            else if (c == '\'')
            {
                return startIndex;
            }
        }
        return startIndex;
    }

    /// <summary>
    /// GetProperty
    /// </summary>
    /// <param name="type"></param>
    /// <param name="name"></param>
    /// <returns></returns>
    public static PropertyInfo GetProperty(this Type type, string name)
    {
        return type.GetProperty(name);
    }

    /// <summary>
    /// GetSingleAttributeOfTypeOrBaseTypesOrNull
    /// </summary>
    /// <typeparam name="TAttribute"></typeparam>
    /// <param name="type"></param>
    /// <param name="inherit"></param>
    /// <returns></returns>
    public static TAttribute GetSingleAttributeOfTypeOrBaseTypesOrNull<TAttribute>(this Type type, bool inherit = true) where TAttribute : Attribute
    {
        TAttribute singleAttributeOrNull = type.GetTypeInfo().GetSingleAttributeOrNull<TAttribute>();
        if (singleAttributeOrNull != null)
        {
            return singleAttributeOrNull;
        }
        if (type.GetTypeInfo().BaseType == null)
        {
            return null;
        }
        return type.GetTypeInfo().BaseType.GetSingleAttributeOfTypeOrBaseTypesOrNull<TAttribute>(inherit);
    }

    /// <summary>
    /// GetSingleAttributeOrNull
    /// </summary>
    /// <typeparam name="TAttribute"></typeparam>
    /// <param name="memberInfo"></param>
    /// <param name="inherit"></param>
    /// <returns></returns>
    public static TAttribute GetSingleAttributeOrNull<TAttribute>(this MemberInfo memberInfo, bool inherit = true) where TAttribute : Attribute
    {
        if (memberInfo == null)
        {
            throw new ArgumentNullException("memberInfo");
        }
        object[] array = memberInfo.GetCustomAttributes(typeof(TAttribute), inherit).ToArray();
        if (array.Length != 0)
        {
            return (TAttribute)array[0];
        }
        return null;
    }

    /// <summary>
    /// GetSpacesString
    /// </summary>
    /// <param name="spacesCount"></param>
    /// <returns></returns>
    public static string GetSpacesString(this int spacesCount)
    {
        StringBuilder sb = new StringBuilder();
        spacesCount.For(delegate
        {
            sb.Append(" &nbsp;&nbsp;");
        });
        return sb.ToString();
    }

    /// <summary>
    /// GetSubString
    /// </summary>
    /// <param name="p_SrcString"></param>
    /// <param name="p_StartIndex"></param>
    /// <param name="p_Length"></param>
    /// <param name="p_TailString"></param>
    /// <returns></returns>
    public static string GetSubString(this string p_SrcString, int p_StartIndex, int p_Length, string p_TailString)
    {
        return p_SrcString.CutWithCN(p_StartIndex, p_Length, p_TailString);
    }

    /// <summary>
    /// GenerateTree:列表生成树形节点
    /// </summary>
    /// <typeparam name="T">集合对象的类型</typeparam>
    /// <typeparam name="K">父节点的类型</typeparam>
    /// <param name="collection">集合</param>
    /// <param name="idSelector">主键ID</param>
    /// <param name="parentIdSelector">父节点</param>
    /// <param name="rootId">根节点</param>
    /// <returns></returns>
    public static IEnumerable<TreeItem<T>> GenerateTree<T, K>(this IEnumerable<T> collection, Func<T, K> idSelector,
        Func<T, K> parentIdSelector, K rootId = default)
    {
        foreach (var c in collection.Where(u =>
        {
            var selector = parentIdSelector(u);
            return (rootId == null && selector == null)
                   || (rootId != null && rootId.Equals(selector));
        }))
        {
            yield return new TreeItem<T>
            {
                Item = c,
                Children = collection.GenerateTree(idSelector, parentIdSelector, idSelector(c))
            };
        }
    }

    /// <summary>
    /// GetArrayValue:通过索引获取数组元素
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="array"></param>
    /// <param name="index"></param>
    /// <returns></returns>
    public static T GetArrayValue<T>(this object[] array, int index)
    {
        try
        {
            return (T)Convert.ChangeType(array[index], typeof(T));
        }
        catch
        {
            return default;
        }
    }

    /// <summary>
    /// GetOrDefault
    /// </summary>
    /// <typeparam name="TKey"></typeparam>
    /// <typeparam name="TValue"></typeparam>
    /// <param name="dictionary"></param>
    /// <param name="key"></param>
    /// <returns></returns>
    public static TValue GetOrDefault<TKey, TValue>(this IDictionary<TKey, TValue> dictionary, TKey key)
    {
        return dictionary.TryGetValue(key, out TValue value) ? value : default;
    }

    #endregion

    #region H

    /// <summary>
    /// HtmlDecode
    /// </summary>
    /// <param name="s"></param>
    /// <param name="output"></param>
    public static void HtmlDecode(this string s, TextWriter output)
    {
        HttpUtility.HtmlDecode(s, output);
    }

    /// <summary>
    /// HtmlDecode
    /// </summary>
    /// <param name="s"></param>
    /// <returns></returns>
    public static string HtmlDecode(this string s)
    {
        return HttpUtility.HtmlDecode(s);
    }

    /// <summary>
    /// HtmlEncode
    /// </summary>
    /// <param name="s"></param>
    /// <returns></returns>
    public static string HtmlEncode(this string s)
    {
        return HttpUtility.HtmlEncode(s);
    }

    /// <summary>
    /// HtmlEncode
    /// </summary>
    /// <param name="s"></param>
    /// <param name="output"></param>
    public static void HtmlEncode(this string s, TextWriter output)
    {
        HttpUtility.HtmlEncode(s, output);
    }

    #endregion

    #region I

    /// <summary>
    /// IfFalse
    /// </summary>
    /// <param name="this"></param>
    /// <param name="trueAction"></param>
    /// <param name="falseAction"></param>
    public static void IfFalse(this bool @this, Action trueAction, Action falseAction = null)
    {
        if (!@this)
        {
            trueAction();
        }
        else
        {
            falseAction?.Invoke();
        }
    }

    /// <summary>
    /// IfNotNull
    /// </summary>
    /// <param name="obj"></param>
    /// <param name="action"></param>
    public static void IfNotNull(this object obj, Action action)
    {
        if (obj != null)
        {
            action();
        }
    }

    /// <summary>
    /// IfNotNull
    /// </summary>
    /// <typeparam name="TItem"></typeparam>
    /// <param name="item"></param>
    /// <param name="action"></param>
    public static void IfNotNull<TItem>(this TItem item, Action<TItem> action) where TItem : class
    {
        if (item != null)
        {
            action(item);
        }
    }

    /// <summary>
    /// IfNotNull
    /// </summary>
    /// <typeparam name="TResult"></typeparam>
    /// <typeparam name="TItem"></typeparam>
    /// <param name="item"></param>
    /// <param name="action"></param>
    /// <param name="defaultValue"></param>
    /// <returns></returns>
    public static TResult IfNotNull<TResult, TItem>(this TItem item, Func<TItem, TResult> action, TResult defaultValue = default) where TItem : class
    {
        return (item != null) ? action(item) : defaultValue;
    }

    /// <summary>
    /// IfNull
    /// </summary>
    /// <typeparam name="TItem"></typeparam>
    /// <param name="item"></param>
    /// <param name="action"></param>
    /// <returns></returns>
    public static TItem IfNull<TItem>(this TItem item, Func<TItem, TItem> action) where TItem : class
    {
        return item ?? action(item);
    }

    /// <summary>
    /// IfNullOrEmpty
    /// </summary>
    /// <param name="value"></param>
    /// <param name="defaultValue"></param>
    /// <returns></returns>
    public static string IfNullOrEmpty(this string value, string defaultValue = "")
    {
        return value.IsNotNullOrEmpty() ? value : defaultValue;
    }

    /// <summary>
    /// IfNullSetEmpty
    /// </summary>
    /// <param name="value"></param>
    /// <returns></returns>
    public static string IfNullSetEmpty(this string value)
    {
        return value ?? string.Empty;
    }

    /// <summary>
    /// IfTrue
    /// </summary>
    /// <param name="this"></param>
    /// <param name="trueAction"></param>
    /// <param name="falseAction"></param>
    public static void IfTrue(this bool @this, Action trueAction, Action falseAction = null)
    {
        if (@this)
        {
            trueAction();
        }
        else
        {
            falseAction?.Invoke();
        }
    }

    /// <summary>
    /// InRange
    /// </summary>
    /// <param name="this"></param>
    /// <param name="minValue"></param>
    /// <param name="maxValue"></param>
    /// <returns></returns>
    public static bool InRange(this DateTime @this, DateTime minValue, DateTime maxValue)
    {
        return @this.CompareTo(minValue) >= 0 && @this.CompareTo(maxValue) <= 0;
    }

    /// <summary>
    /// InvokeSafely
    /// </summary>
    /// <param name="eventHandler"></param>
    /// <param name="sender"></param>
    public static void InvokeSafely(this EventHandler eventHandler, object sender)
    {
        eventHandler.InvokeSafely(sender, EventArgs.Empty);
    }

    /// <summary>
    /// InvokeSafely
    /// </summary>
    /// <param name="eventHandler"></param>
    /// <param name="sender"></param>
    /// <param name="e"></param>
    public static void InvokeSafely(this EventHandler eventHandler, object sender, EventArgs e)
    {
        eventHandler?.Invoke(sender, e);
    }

    /// <summary>
    /// InvokeSafely
    /// </summary>
    /// <typeparam name="TEventArgs"></typeparam>
    /// <param name="eventHandler"></param>
    /// <param name="sender"></param>
    /// <param name="e"></param>
    public static void InvokeSafely<TEventArgs>(this EventHandler<TEventArgs> eventHandler, object sender, TEventArgs e) where TEventArgs : EventArgs
    {
        eventHandler?.Invoke(sender, e);
    }

    /// <summary>
    /// IsAfternoon
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static bool IsAfternoon(this DateTime @this)
    {
        return @this.TimeOfDay >= new DateTime(1995, 3, 7, 12, 0, 0).TimeOfDay;
    }

    /// <summary>
    /// IsAlpha
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static bool IsAlpha(this string @this)
    {
        return !Regex.IsMatch(@this, "[^a-zA-Z]");
    }

    /// <summary>
    /// IsAlphaNumeric
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static bool IsAlphaNumeric(this string @this)
    {
        return !Regex.IsMatch(@this, "[^a-zA-Z0-9]");
    }

    /// <summary>
    /// IsAsync
    /// </summary>
    /// <param name="method"></param>
    /// <returns></returns>
    public static bool IsAsync(this MethodInfo method)
    {
        return method.ReturnType == typeof(Task) || (method.ReturnType.GetTypeInfo().IsGenericType && method.ReturnType.GetGenericTypeDefinition() == typeof(Task<>));
    }

    /// <summary>
    /// IsBool
    /// </summary>
    /// <param name="type"></param>
    /// <returns></returns>
    public static bool IsBool(this Type type)
    {
        return type == typeof(bool);
    }

    /// <summary>
    /// IsEmpty
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static bool IsEmpty(this string @this)
    {
        return @this == "";
    }

    /// <summary>
    /// IsEnum
    /// </summary>
    /// <param name="type"></param>
    /// <returns></returns>
    public static bool IsEnum(this Type type)
    {
        return type.IsEnum;
    }

    /// <summary>
    /// IsGenericType
    /// </summary>
    /// <param name="type"></param>
    /// <returns></returns>
    public static bool IsGenericType(this Type type)
    {
        return type.IsGenericType;
    }

    /// <summary>
    /// IsIn
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="item"></param>
    /// <param name="list"></param>
    /// <returns></returns>
    public static bool IsIn<T>(this T item, params T[] list)
    {
        return list.Contains(item);
    }

    /// <summary>
    /// IsMatch
    /// </summary>
    /// <param name="input"></param>
    /// <param name="pattern"></param>
    /// <returns></returns>
    public static bool IsMatch(this string input, string pattern)
    {
        return Regex.IsMatch(input, pattern);
    }

    /// <summary>
    /// IsMatch
    /// </summary>
    /// <param name="input"></param>
    /// <param name="pattern"></param>
    /// <param name="options"></param>
    /// <returns></returns>
    public static bool IsMatch(this string input, string pattern, RegexOptions options)
    {
        return Regex.IsMatch(input, pattern, options);
    }

    /// <summary>
    /// IsMorning
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static bool IsMorning(this DateTime @this)
    {
        return @this.TimeOfDay < new DateTime(1995, 3, 7, 12, 0, 0).TimeOfDay;
    }

    /// <summary>
    /// IsNotEmpty
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static bool IsNotEmpty(this string @this)
    {
        return @this != "";
    }

    /// <summary>
    /// IsNotNull
    /// </summary>
    /// <param name="obj"></param>
    /// <returns></returns>
    public static bool IsNotNull(this object obj)
    {
        return obj != null;
    }

    /// <summary>
    /// IsNotNull
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static bool IsNotNull(this string @this)
    {
        return @this != null;
    }

    /// <summary>
    /// IsNotNullOrDefault
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="obj"></param>
    /// <returns></returns>
    public static bool IsNotNullOrDefault<T>(this T obj) where T : class
    {
        return obj != null && EqualityComparer<T>.Default.Equals(obj, null);
    }

    /// <summary>
    /// IsNotNullOrEmpty
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static bool IsNotNullOrEmpty(this string @this)
    {
        return !string.IsNullOrEmpty(@this);
    }

    /// <summary>
    /// IsNotNullOrEmpty
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="this"></param>
    /// <returns></returns>
    public static bool IsNotNullOrEmpty<T>(this ICollection<T> @this)
    {
        return @this != null && @this.Count != 0;
    }

    /// <summary>
    /// IsNotNullOrWhiteSpace
    /// </summary>
    /// <param name="value"></param>
    /// <returns></returns>
    public static bool IsNotNullOrWhiteSpace(this string value)
    {
        return !string.IsNullOrWhiteSpace(value);
    }

    /// <summary>
    /// IsNow
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static bool IsNow(this DateTime @this)
    {
        return @this == DateTime.Now;
    }

    /// <summary>
    /// IsNull
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static bool IsNull(this string @this)
    {
        return @this == null;
    }

    /// <summary>
    /// IsNull
    /// </summary>
    /// <param name="obj"></param>
    /// <returns></returns>
    public static bool IsNull(this object obj)
    {
        return obj == null;
    }

    /// <summary>
    /// IsNullableType
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static bool IsNullableType(this Type @this)
    {
        return @this.IsGenericType && @this.GetGenericTypeDefinition().Equals(typeof(Nullable<>));
    }

    /// <summary>
    /// IsNullOrEmpty
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static bool IsNullOrEmpty(this string @this)
    {
        return string.IsNullOrEmpty(@this);
    }

    /// <summary>
    /// IsNullOrEmpty
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="this"></param>
    /// <returns></returns>
    public static bool IsNullOrEmpty<T>(this ICollection<T> @this)
    {
        return @this == null || @this.Count == 0;
    }

    /// <summary>
    /// IsNullOrWhiteSpace
    /// </summary>
    /// <param name="value"></param>
    /// <returns></returns>
    public static bool IsNullOrWhiteSpace(this string value)
    {
        return string.IsNullOrWhiteSpace(value);
    }

    /// <summary>
    /// IsNumeric
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static bool IsNumeric(this string @this)
    {
        return !Regex.IsMatch(@this, "[^0-9]");
    }

    /// <summary>
    /// IsUrl
    /// </summary>
    /// <param name="strUrl"></param>
    /// <returns></returns>
    public static bool IsUrl(this string strUrl)
    {
        return Regex.IsMatch(strUrl, "^(http|https)\\://([a-zA-Z0-9\\.\\-]+(\\:[a-zA-Z0-9\\.&%\\$\\-]+)*@)*((25[0-5]|2[0-4][0-9]|[0-1]{1}[0-9]{2}|[1-9]{1}[0-9]{1}|[1-9])\\.(25[0-5]|2[0-4][0-9]|[0-1]{1}[0-9]{2}|[1-9]{1}[0-9]{1}|[1-9]|0)\\.(25[0-5]|2[0-4][0-9]|[0-1]{1}[0-9]{2}|[1-9]{1}[0-9]{1}|[1-9]|0)\\.(25[0-5]|2[0-4][0-9]|[0-1]{1}[0-9]{2}|[1-9]{1}[0-9]{1}|[0-9])|localhost|([a-zA-Z0-9\\-]+\\.)*[a-zA-Z0-9\\-]+\\.(com|edu|gov|int|mil|net|org|biz|arpa|info|name|pro|aero|coop|museum|[a-zA-Z]{1,10}))(\\:[0-9]+)*(/($|[a-zA-Z0-9\\.\\,\\?\\'\\\\\\+&%\\$#\\=~_\\-]+))*$");
    }

    /// <summary>
    /// IsValidBase64String
    /// </summary>
    /// <param name="str"></param>
    /// <returns></returns>
    public static bool IsValidBase64String(this string str)
    {
        return Regex.IsMatch(str, "[A-Za-z0-9\\+\\/\\=]");
    }

    /// <summary>
    /// IsValidEmail
    /// </summary>
    /// <param name="obj"></param>
    /// <returns></returns>
    public static bool IsValidEmail(this string obj)
    {
        return Regex.IsMatch(obj, "^([a-zA-Z0-9_\\-\\.]+)@((\\[[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.)|(([a-zA-Z0-9\\-]+\\.)+))([a-zA-Z]{2,4}|[0-9]{1,3})(\\]?)$");
    }

    /// <summary>
    /// IsValidIP
    /// </summary>
    /// <param name="obj"></param>
    /// <returns></returns>
    public static bool IsValidIP(this string obj)
    {
        return Regex.IsMatch(obj, "^(25[0-5]|2[0-4][0-9]|[0-1]{1}[0-9]{2}|[1-9]{1}[0-9]{1}|[1-9])\\.(25[0-5]|2[0-4][0-9]|[0-1]{1}[0-9]{2}|[1-9]{1}[0-9]{1}|[1-9]|0)\\.(25[0-5]|2[0-4][0-9]|[0-1]{1}[0-9]{2}|[1-9]{1}[0-9]{1}|[1-9]|0)\\.(25[0-5]|2[0-4][0-9]|[0-1]{1}[0-9]{2}|[1-9]{1}[0-9]{1}|[0-9])$");
    }

    /// <summary>
    /// IsValidMobile
    /// </summary>
    /// <param name="mobile"></param>
    /// <returns></returns>
    public static bool IsValidMobile(string mobile)
    {
        if (mobile.IsNullOrEmpty())
        {
            return false;
        }
        mobile = mobile.Trim();
        return Regex.IsMatch(mobile, "^(1[3|4|5|6|7|8|9])\\d{9}$", RegexOptions.IgnoreCase);
    }

    /// <summary>
    /// IsValidSafeSqlString
    /// </summary>
    /// <param name="str"></param>
    /// <returns></returns>
    public static bool IsValidSafeSqlString(this string str)
    {
        return !Regex.IsMatch(str, "[-|;|,|\\/|\\(|\\)|\\[|\\]|\\}|\\{|%|@|\\*|!|\\']");
    }

    /// <summary>
    /// IsValueType
    /// </summary>
    /// <param name="type"></param>
    /// <returns></returns>
    public static bool IsValueType(this Type type)
    {
        return type.IsValueType;
    }

    #endregion

    #region J

    /// <summary>
    /// Join
    /// </summary>
    /// <param name="separator"></param>
    /// <param name="value"></param>
    /// <returns></returns>
    public static string Join(this string separator, string[] value)
    {
        return string.Join(separator, value);
    }

    /// <summary>
    /// Join
    /// </summary>
    /// <param name="separator"></param>
    /// <param name="value"></param>
    /// <param name="startIndex"></param>
    /// <param name="count"></param>
    /// <returns></returns>
    public static string Join(this string separator, string[] value, int startIndex, int count)
    {
        return string.Join(separator, value, startIndex, count);
    }

    /// <summary>
    /// Join
    /// </summary>
    /// <param name="separator"></param>
    /// <param name="values"></param>
    /// <returns></returns>
    public static string Join(this string separator, object[] values)
    {
        return string.Join(separator, values);
    }

    /// <summary>
    /// Join
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="separator"></param>
    /// <param name="values"></param>
    /// <returns></returns>
    public static string Join<T>(this string separator, IEnumerable<T> values)
    {
        return string.Join(separator, values);
    }

    /// <summary>
    /// Join
    /// </summary>
    /// <param name="separator"></param>
    /// <param name="values"></param>
    /// <returns></returns>
    public static string Join(this string separator, IEnumerable<string> values)
    {
        return string.Join(separator, values);
    }

    /// <summary>
    /// JoinAsString
    /// </summary>
    /// <param name="source"></param>
    /// <param name="separator"></param>
    /// <returns></returns>
    public static string JoinAsString(this IEnumerable<string> source, string separator)
    {
        return string.Join(separator, source);
    }

    /// <summary>
    /// JoinAsString
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="source"></param>
    /// <param name="separator"></param>
    /// <returns></returns>
    public static string JoinAsString<T>(this IEnumerable<T> source, string separator)
    {
        return string.Join(separator, source);
    }

    #endregion

    #region L

    /// <summary>
    /// Left
    /// </summary>
    /// <param name="this"></param>
    /// <param name="length"></param>
    /// <returns></returns>
    public static string Left(this string @this, int length)
    {
        return @this.LeftSafe(length);
    }

    /// <summary>
    /// LeftSafe
    /// </summary>
    /// <param name="this"></param>
    /// <param name="length"></param>
    /// <returns></returns>
    public static string LeftSafe(this string @this, int length)
    {
        return @this.Substring(0, Math.Min(length, @this.Length));
    }

    /// <summary>
    /// Locking
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <typeparam name="TResult"></typeparam>
    /// <param name="source"></param>
    /// <param name="func"></param>
    /// <returns></returns>
    public static TResult Locking<T, TResult>(this T source, Func<T, TResult> func) where T : class
    {
        lock (source)
        {
            return func(source);
        }
    }

    /// <summary>
    /// Locking
    /// </summary>
    /// <typeparam name="TResult"></typeparam>
    /// <param name="source"></param>
    /// <param name="func"></param>
    /// <returns></returns>
    public static TResult Locking<TResult>(this object source, Func<TResult> func)
    {
        lock (source)
        {
            return func();
        }
    }

    /// <summary>
    /// Locking
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="source"></param>
    /// <param name="action"></param>
    public static void Locking<T>(this T source, Action<T> action) where T : class
    {
        lock (source)
        {
            action(source);
        }
    }

    /// <summary>
    /// Locking
    /// </summary>
    /// <param name="source"></param>
    /// <param name="action"></param>
    public static void Locking(this object source, Action action)
    {
        lock (source)
        {
            action();
        }
    }

    #endregion

    #region M

    /// <summary>
    /// Match
    /// </summary>
    /// <param name="input"></param>
    /// <param name="pattern"></param>
    /// <returns></returns>
    public static Match Match(this string input, string pattern)
    {
        return Regex.Match(input, pattern);
    }

    /// <summary>
    /// Match
    /// </summary>
    /// <param name="input"></param>
    /// <param name="pattern"></param>
    /// <param name="options"></param>
    /// <returns></returns>
    public static Match Match(this string input, string pattern, RegexOptions options)
    {
        return Regex.Match(input, pattern, options);
    }

    /// <summary>
    /// Matches
    /// </summary>
    /// <param name="input"></param>
    /// <param name="pattern"></param>
    /// <param name="options"></param>
    /// <returns></returns>
    public static MatchCollection Matches(this string input, string pattern, RegexOptions options)
    {
        return Regex.Matches(input, pattern, options);
    }

    /// <summary>
    /// Matches
    /// </summary>
    /// <param name="input"></param>
    /// <param name="pattern"></param>
    /// <returns></returns>
    public static MatchCollection Matches(this string input, string pattern)
    {
        return Regex.Matches(input, pattern);
    }

    /// <summary>
    /// Md5
    /// </summary>
    /// <param name="str"></param>
    /// <returns></returns>
    public static string Md5(this string str)
    {
        byte[] bytes = Encoding.UTF8.GetBytes(str);
        bytes = new MD5CryptoServiceProvider().ComputeHash(bytes);
        string text = "";
        for (int i = 0; i < bytes.Length; i++)
        {
            text += bytes[i].ToString("x").PadLeft(2, '0');
        }
        return text;
    }

    #endregion

    #region N

    /// <summary>
    /// Nl2Br
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static string Nl2Br(this string @this)
    {
        return @this.Replace("\r\n", "<br />").Replace("\n", "<br />");
    }

    #endregion

    #region P

    /// <summary>
    /// PageBy
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="query"></param>
    /// <param name="skipCount"></param>
    /// <param name="maxResultCount"></param>
    /// <returns></returns>
    public static IEnumerable<T> PageBy<T>(this IEnumerable<T> query, int skipCount, int maxResultCount)
    {
        if (query == null)
        {
            throw new ArgumentNullException("query");
        }
        return query.Skip(skipCount).Take(maxResultCount);
    }

    /// <summary>
    /// PageBy
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="query"></param>
    /// <param name="skipCount"></param>
    /// <param name="maxResultCount"></param>
    /// <returns></returns>
    public static IEnumerable<T> PageBy<T>(this IList<T> query, int skipCount, int maxResultCount)
    {
        if (query == null)
        {
            throw new ArgumentNullException("query");
        }
        return query.Skip(skipCount).Take(maxResultCount);
    }

    /// <summary>
    /// PageBy
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="query"></param>
    /// <param name="skipCount"></param>
    /// <param name="maxResultCount"></param>
    /// <returns></returns>
    public static IEnumerable<T> PageBy<T>(this IQueryable<T> query, int skipCount, int maxResultCount)
    {
        if (query == null)
        {
            throw new ArgumentNullException("query");
        }
        return query.Skip(skipCount).Take(maxResultCount);
    }

    /// <summary>
    /// PageBy
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="query"></param>
    /// <param name="skipCount"></param>
    /// <param name="maxResultCount"></param>
    /// <returns></returns>
    public static IEnumerable<T> PageBy<T>(this List<T> query, int skipCount, int maxResultCount)
    {
        if (query == null)
        {
            throw new ArgumentNullException("query");
        }
        return query.Skip(skipCount).Take(maxResultCount);
    }

    /// <summary>
    /// PageByIndex
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="query"></param>
    /// <param name="pageIndex"></param>
    /// <param name="pageSize"></param>
    /// <returns></returns>
    public static IEnumerable<T> PageByIndex<T>(this IEnumerable<T> query, int pageIndex, int pageSize)
    {
        if (query == null)
        {
            throw new ArgumentNullException("query");
        }
        if (pageIndex <= 0)
        {
            pageIndex = 1;
        }
        if (pageSize <= 0)
        {
            pageSize = 20;
        }
        return query.Skip((pageIndex - 1) * pageSize).Take(pageSize);
    }

    /// <summary>
    /// PageByIndex
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="query"></param>
    /// <param name="pageIndex"></param>
    /// <param name="pageSize"></param>
    /// <returns></returns>
    public static IEnumerable<T> PageByIndex<T>(this IList<T> query, int pageIndex, int pageSize)
    {
        if (query == null)
        {
            throw new ArgumentNullException("query");
        }
        if (pageIndex <= 0)
        {
            pageIndex = 1;
        }
        if (pageSize <= 0)
        {
            pageSize = 20;
        }
        return query.Skip((pageIndex - 1) * pageSize).Take(pageSize);
    }

    /// <summary>
    /// PageByIndex
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="query"></param>
    /// <param name="pageIndex"></param>
    /// <param name="pageSize"></param>
    /// <returns></returns>
    public static IEnumerable<T> PageByIndex<T>(this IQueryable<T> query, int pageIndex, int pageSize)
    {
        if (query == null)
        {
            throw new ArgumentNullException("query");
        }
        if (pageIndex <= 0)
        {
            pageIndex = 1;
        }
        if (pageSize <= 0)
        {
            pageSize = 20;
        }
        return query.Skip((pageIndex - 1) * pageSize).Take(pageSize);
    }

    /// <summary>
    /// PageByIndex
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="query"></param>
    /// <param name="pageIndex"></param>
    /// <param name="pageSize"></param>
    /// <returns></returns>
    public static IEnumerable<T> PageByIndex<T>(this List<T> query, int pageIndex, int pageSize)
    {
        if (query == null)
        {
            throw new ArgumentNullException("query");
        }
        if (pageIndex <= 0)
        {
            pageIndex = 1;
        }
        if (pageSize <= 0)
        {
            pageSize = 20;
        }
        return query.Skip((pageIndex - 1) * pageSize).Take(pageSize);
    }

    #endregion

    #region R

    /// <summary>
    /// RemoveHtml
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static string RemoveHtml(this string @this)
    {
        StringBuilder stringBuilder = new StringBuilder(@this);
        StringBuilder stringBuilder2 = new StringBuilder();
        int num = 0;
        while (num < stringBuilder.Length)
        {
            char c = stringBuilder[num];
            num++;
            if (c == '<')
            {
                while (num < stringBuilder.Length)
                {
                    c = stringBuilder[num];
                    num++;
                    switch (c)
                    {
                        case '\'':
                            num = stringBuilder.GetIndexAfterNextSingleQuote(num, allowEscape: true);
                            continue;
                        case '"':
                            num = stringBuilder.GetIndexAfterNextDoubleQuote(num, allowEscape: true);
                            continue;
                        default:
                            continue;
                        case '>':
                            break;
                    }
                    break;
                }
            }
            else
            {
                stringBuilder2.Append(c);
            }
        }
        return stringBuilder2.ToString();
    }

    /// <summary>
    /// RemoveHtmlSimple
    /// </summary>
    /// <param name="str"></param>
    /// <returns></returns>
    public static string RemoveHtmlSimple(this string str)
    {
        if (!string.IsNullOrEmpty(str))
        {
            string pattern = "<.*?>";
            str = new Regex(pattern).Replace(str, "");
            str = str.Replace("&nbsp;", " ");
        }
        return str;
    }

    /// <summary>
    /// RemoveLetter
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static string RemoveLetter(this string @this)
    {
        return new string((from x in @this.ToCharArray()
                           where !char.IsLetter(x)
                           select x).ToArray());
    }

    /// <summary>
    /// RemoveNumber
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static string RemoveNumber(this string @this)
    {
        return new string((from x in @this.ToCharArray()
                           where !char.IsNumber(x)
                           select x).ToArray());
    }

    /// <summary>
    /// Repeat
    /// </summary>
    /// <param name="this"></param>
    /// <param name="repeatCount"></param>
    /// <returns></returns>
    public static string Repeat(this string @this, int repeatCount)
    {
        if (@this.Length == 1)
        {
            return new string(@this[0], repeatCount);
        }
        StringBuilder stringBuilder = new StringBuilder(repeatCount * @this.Length);
        while (repeatCount-- > 0)
        {
            stringBuilder.Append(@this);
        }
        return stringBuilder.ToString();
    }

    /// <summary>
    /// Replace
    /// </summary>
    /// <param name="this"></param>
    /// <param name="startIndex"></param>
    /// <param name="length"></param>
    /// <param name="value"></param>
    /// <returns></returns>
    public static string Replace(this string @this, int startIndex, int length, string value)
    {
        @this = @this.Remove(startIndex, length).Insert(startIndex, value);
        return @this;
    }

    /// <summary>
    /// ReplaceByEmpty
    /// </summary>
    /// <param name="this"></param>
    /// <param name="values"></param>
    /// <returns></returns>
    public static string ReplaceByEmpty(this string @this, params string[] values)
    {
        foreach (string oldValue in values)
        {
            @this = @this.Replace(oldValue, "");
        }
        return @this;
    }

    /// <summary>
    /// ReThrow
    /// </summary>
    /// <param name="exception"></param>
    public static void ReThrow(this Exception exception)
    {
        ExceptionDispatchInfo.Capture(exception).Throw();
    }

    /// <summary>
    /// Reverse
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static string Reverse(this string @this)
    {
        if (@this.Length <= 1)
        {
            return @this;
        }
        char[] array = @this.ToCharArray();
        Array.Reverse(array);
        return new string(array);
    }

    /// <summary>
    /// Right
    /// </summary>
    /// <param name="this"></param>
    /// <param name="length"></param>
    /// <returns></returns>
    public static string Right(this string @this, int length)
    {
        return @this.RightSafe(length);
    }

    /// <summary>
    /// RightSafe
    /// </summary>
    /// <param name="this"></param>
    /// <param name="length"></param>
    /// <returns></returns>
    public static string RightSafe(this string @this, int length)
    {
        return @this.Substring(Math.Max(0, @this.Length - length));
    }

    #endregion

    #region S

    /// <summary>
    /// SaveAs
    /// </summary>
    /// <param name="this"></param>
    /// <param name="fileName"></param>
    /// <param name="append"></param>
    public static void SaveAs(this string @this, string fileName, bool append = false)
    {
        using (TextWriter textWriter = new StreamWriter(fileName, append))
        {
            textWriter.Write(@this);
        }
    }

    /// <summary>
    /// SaveAs
    /// </summary>
    /// <param name="this"></param>
    /// <param name="file"></param>
    /// <param name="append"></param>
    public static void SaveAs(this string @this, FileInfo file, bool append = false)
    {
        using (TextWriter textWriter = new StreamWriter(file.FullName, append))
        {
            textWriter.Write(@this);
        }
    }

    /// <summary>
    /// Split
    /// </summary>
    /// <param name="str"></param>
    /// <param name="separator"></param>
    /// <returns></returns>
    public static string[] Split(this string str, string separator)
    {
        return str.Split(new string[1] { separator }, StringSplitOptions.None);
    }

    /// <summary>
    /// Split
    /// </summary>
    /// <param name="this"></param>
    /// <param name="separator"></param>
    /// <param name="option"></param>
    /// <returns></returns>
    public static string[] Split(this string @this, string separator, StringSplitOptions option = StringSplitOptions.None)
    {
        return @this.Split(new string[1] { separator }, option);
    }

    /// <summary>
    /// SplitToLines
    /// </summary>
    /// <param name="str"></param>
    /// <param name="options"></param>
    /// <returns></returns>
    public static string[] SplitToLines(this string str, StringSplitOptions options)
    {
        return str.Split(Environment.NewLine, options);
    }

    /// <summary>
    /// SplitToLines
    /// </summary>
    /// <param name="str"></param>
    /// <returns></returns>
    public static string[] SplitToLines(this string str)
    {
        return str.Split(Environment.NewLine);
    }

    /// <summary>
    /// SqlTypeNameToSqlDbType
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static SqlDbType SqlTypeNameToSqlDbType(this string @this)
    {
        switch (@this.ToLower())
        {
            case "image":
                return SqlDbType.Image;
            case "text":
                return SqlDbType.Text;
            case "uniqueidentifier":
                return SqlDbType.UniqueIdentifier;
            case "date":
                return SqlDbType.Date;
            case "time":
                return SqlDbType.Time;
            case "datetime2":
                return SqlDbType.DateTime2;
            case "datetimeoffset":
                return SqlDbType.DateTimeOffset;
            case "tinyint":
                return SqlDbType.TinyInt;
            case "smallint":
                return SqlDbType.SmallInt;
            case "int":
                return SqlDbType.Int;
            case "smalldatetime":
                return SqlDbType.SmallDateTime;
            case "real":
                return SqlDbType.Real;
            case "money":
                return SqlDbType.Money;
            case "datetime":
                return SqlDbType.DateTime;
            case "float":
                return SqlDbType.Float;
            case "sql_variant":
                return SqlDbType.Variant;
            case "ntext":
                return SqlDbType.NText;
            case "bit":
                return SqlDbType.Bit;
            case "decimal":
                return SqlDbType.Decimal;
            case "numeric":
                return SqlDbType.Decimal;
            case "smallmoney":
                return SqlDbType.SmallMoney;
            case "bigint":
                return SqlDbType.BigInt;
            case "varbinary":
                return SqlDbType.VarBinary;
            case "varchar":
                return SqlDbType.VarChar;
            case "binary":
                return SqlDbType.Binary;
            case "char":
                return SqlDbType.Char;
            case "timestamp":
                return SqlDbType.Timestamp;
            case "nvarchar":
                return SqlDbType.NVarChar;
            case "sysname":
                return SqlDbType.NVarChar;
            case "nchar":
                return SqlDbType.NChar;
            case "hierarchyid":
                return SqlDbType.Udt;
            case "geometry":
                return SqlDbType.Udt;
            case "geography":
                return SqlDbType.Udt;
            case "xml":
                return SqlDbType.Xml;
            default:
                throw new Exception($"Unsupported Type: {@this}");
        }
    }

    /// <summary>
    /// StartOfDay
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static DateTime StartOfDay(this DateTime @this)
    {
        return new DateTime(@this.Year, @this.Month, @this.Day);
    }

    /// <summary>
    /// StrToDateTime
    /// </summary>
    /// <param name="str"></param>
    /// <returns></returns>
    public static DateTime StrToDateTime(this string str)
    {
        return str.ToDateTime(DateTime.Now);
    }

    /// <summary>
    /// SortByDependencies
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="source"></param>
    /// <param name="getDependencies"></param>
    /// <returns></returns>
    public static List<T> SortByDependencies<T>(this IEnumerable<T> source, Func<T, IEnumerable<T>> getDependencies)
    {
        List<T> list = new List<T>();
        Dictionary<T, bool> visited = new Dictionary<T, bool>();
        foreach (T item in source)
        {
            SortByDependenciesVisit(item, getDependencies, list, visited);
        }
        return list;
    }

    #endregion

    #region T

    /// <summary>
    /// To
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="obj"></param>
    /// <returns></returns>
    public static T To<T>(this object obj) where T : struct
    {
        return (T)Convert.ChangeType(obj, typeof(T));
    }

    /// <summary>
    /// ToArray
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="this"></param>
    /// <param name="func"></param>
    /// <returns></returns>
    public static string[] ToArray<T>(this IList<T> @this, Func<T, string> func)
    {
        string[] array = new string[@this.Count];
        for (int i = 0; i < @this.Count; i++)
        {
            array[i] = func(@this[i]);
        }
        return array;
    }

    /// <summary>
    /// ToArray
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="this"></param>
    /// <param name="func"></param>
    /// <returns></returns>
    public static int[] ToArray<T>(this IList<T> @this, Func<T, int> func)
    {
        int[] array = new int[@this.Count];
        for (int i = 0; i < @this.Count; i++)
        {
            array[i] = func(@this[i]);
        }
        return array;
    }

    /// <summary>
    /// ToBool
    /// </summary>
    /// <param name="expression"></param>
    /// <returns></returns>
    public static bool ToBool(this object expression)
    {
        if (expression != null)
        {
            bool result;
            try
            {
                result = (bool)expression;
            }
            catch
            {
                result = (((int)expression != 0) ? true : false);
            }
            return result;
        }
        return false;
    }

    /// <summary>
    /// ToBool
    /// </summary>
    /// <param name="expression"></param>
    /// <param name="defValue"></param>
    /// <returns></returns>
    public static bool ToBool(this string expression, bool defValue = false)
    {
        if (expression != null)
        {
            if (string.Compare(expression, "true", ignoreCase: true) == 0)
            {
                return true;
            }
            if (string.Compare(expression, "false", ignoreCase: true) == 0)
            {
                return false;
            }
        }
        return defValue;
    }

    /// <summary>
    /// ToDateTime
    /// </summary>
    /// <param name="obj"></param>
    /// <returns></returns>
    public static DateTime ToDateTime(this object obj)
    {
        return obj.ToString().StrToDateTime();
    }

    /// <summary>
    /// ToDateTime
    /// </summary>
    /// <param name="str"></param>
    /// <param name="defValue"></param>
    /// <returns></returns>
    public static DateTime ToDateTime(this string str, DateTime defValue)
    {
        if (!string.IsNullOrEmpty(str) && DateTime.TryParse(str, out DateTime result))
        {
            return result;
        }
        return defValue;
    }

    /// <summary>
    /// ToDecimal
    /// </summary>
    /// <param name="expression"></param>
    /// <param name="defValue"></param>
    /// <returns></returns>
    public static decimal ToDecimal(this string expression, decimal defValue = 0)
    {
        if (string.IsNullOrEmpty(expression))
        {
            return defValue;
        }
        try
        {
            return Math.Round(Convert.ToDecimal(expression), 2);
        }
        catch
        {
            return defValue;
        }
    }

    /// <summary>
    /// ToDecimal
    /// </summary>
    /// <param name="expression"></param>
    /// <param name="defValue"></param>
    /// <returns></returns>
    public static decimal ToDecimal(this object expression, decimal defValue = 0)
    {
        if (expression == null)
        {
            return defValue;
        }
        try
        {
            return Math.Round(Convert.ToDecimal(expression), 2);
        }
        catch
        {
            return defValue;
        }
    }

    /// <summary>
    /// ToDescripttion:针对Enum类型添加扩展方法，并使用反射读取当前枚举值所对应的显示值
    /// </summary>
    /// <param name="val"></param>
    /// <returns></returns>
    public static string ToDescripttion(this Enum val)
    {
        var type = val.GetType();

        var memberInfo = type.GetMember(val.ToString());

        var attributes = memberInfo[0].GetCustomAttributes(typeof(DescriptionAttribute), false);

        if (attributes == null || attributes.Length != 1)
        {
            //如果没有自定义描述，就把当前枚举值的对应名称返回
            return val.ToString();
        }

        return (attributes.Single() as DescriptionAttribute).Description;
    }

    /// <summary>
    /// ToDataTable:集合转DataTable
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="data"></param>
    /// <param name="exclude"></param>
    /// <returns></returns>
    public static DataTable ToDataTable<T>(this IEnumerable<T> data, params string[] exclude)
    {
        PropertyDescriptorCollection properties = TypeDescriptor.GetProperties(typeof(T));
        DataTable table = new DataTable();
        foreach (PropertyDescriptor prop in properties)
        {
            if (exclude.Contains(prop.Name)) continue;
            table.Columns.Add(prop.Name, Nullable.GetUnderlyingType(prop.PropertyType) ?? prop.PropertyType);
        }
        foreach (T item in data)
        {
            DataRow row = table.NewRow();
            foreach (PropertyDescriptor prop in properties)
            {
                if (exclude.Contains(prop.Name)) continue;
                row[prop.Name] = prop.GetValue(item) ?? DBNull.Value;
            }
            table.Rows.Add(row);
        }
        return table;
    }

    /// <summary>
    /// ToExpando
    /// </summary>
    /// <param name="dictionary"></param>
    /// <returns></returns>
    public static ExpandoObject ToExpando(this IDictionary<string, object> dictionary)
    {
        ExpandoObject expandoObject = new ExpandoObject();
        IDictionary<string, object> dictionary2 = expandoObject;
        foreach (KeyValuePair<string, object> item2 in dictionary)
        {
            if (item2.Value is IDictionary<string, object>)
            {
                ExpandoObject value = ((IDictionary<string, object>)item2.Value).ToExpando();
                dictionary2.Add(item2.Key, value);
            }
            else if (item2.Value is ICollection)
            {
                List<object> list = new List<object>();
                foreach (object item3 in (ICollection)item2.Value)
                {
                    if (item3 is IDictionary<string, object>)
                    {
                        ExpandoObject item = ((IDictionary<string, object>)item3).ToExpando();
                        list.Add(item);
                    }
                    else
                    {
                        list.Add(item3);
                    }
                }
                dictionary2.Add(item2.Key, list);
            }
            else
            {
                dictionary2.Add(item2);
            }
        }
        return expandoObject;
    }

    /// <summary>
    /// ToFloat
    /// </summary>
    /// <param name="expression"></param>
    /// <param name="defValue"></param>
    /// <returns></returns>
    public static float ToFloat(this object expression, float defValue = 0)
    {
        return expression.IfNotNull((object x) => x.ToString().ToFloat(), defValue);
    }

    /// <summary>
    /// ToFloat
    /// </summary>
    /// <param name="strValue"></param>
    /// <param name="defValue"></param>
    /// <returns></returns>
    public static float ToFloat(this string strValue, float defValue = 0)
    {
        if (strValue == null || strValue.Length > 10)
        {
            return defValue;
        }
        float result = defValue;
        if (strValue != null && Regex.IsMatch(strValue, "^([-]|[0-9])[0-9]*(\\.\\w*)?$"))
        {
            float.TryParse(strValue, out result);
        }
        return result;
    }

    /// <summary>
    /// ToGuid
    /// </summary>
    /// <param name="value"></param>
    /// <returns></returns>
    public static Guid ToGuid(this int value)
    {
        byte[] array = new byte[16];
        BitConverter.GetBytes(value).CopyTo(array, 0);
        return new Guid(array);
    }

    /// <summary>
    /// ToInt
    /// </summary>
    /// <param name="str"></param>
    /// <param name="defValue"></param>
    /// <returns></returns>
    public static int ToInt(this string str, int defValue = 0)
    {
        if (string.IsNullOrEmpty(str) || str.Trim().Length >= 11 || !Regex.IsMatch(str.Trim(), "^([-]|[0-9])[0-9]*(\\.\\w*)?$"))
        {
            return defValue;
        }
        if (int.TryParse(str, out int result))
        {
            return result;
        }
        return Convert.ToInt32(str.ToFloat(defValue));
    }

    /// <summary>
    /// ToInt
    /// </summary>
    /// <param name="expression"></param>
    /// <param name="defValue"></param>
    /// <returns></returns>
    public static int ToInt(this object expression, int defValue = 0)
    {
        return expression.IfNotNull((object x) => x.ToString().ToInt(), defValue);
    }

    /// <summary>
    /// ToIntList
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static List<int> ToIntList(this string[] @this)
    {
        List<int> result = new List<int>();
        @this.ForEach(delegate (string s)
        {
            result.Add(Extensions.ToInt(s, 0));
        });
        return result;
    }

    /// <summary>
    /// ToList
    /// </summary>
    /// <param name="input"></param>
    /// <param name="segmentStr"></param>
    /// <returns></returns>
    public static List<string> ToList(this string input, char segmentStr = ',')
    {
        List<string> list = new List<string>();
        if (input.IsNotNullOrEmpty())
        {
            string[] array = input.Split(segmentStr);
            foreach (string text in array)
            {
                if (text.IsNotNullOrEmpty())
                {
                    list.Add(text);
                }
            }
        }
        return list;
    }

    /// <summary>
    /// ToList
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static List<string> ToList(this string[] @this)
    {
        List<string> result = new List<string>();
        @this.ForEach(delegate (string s)
        {
            result.Add(s);
        });
        return result;
    }

    /// <summary>
    /// ToList
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="this"></param>
    /// <param name="func"></param>
    /// <returns></returns>
    public static List<string> ToList<T>(this IList<T> @this, Func<T, string> func)
    {
        List<string> result = new List<string>();
        @this.ForEach(delegate (T x)
        {
            result.Add(func(x));
        });
        return result;
    }

    /// <summary>
    /// ToList
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="this"></param>
    /// <param name="func"></param>
    /// <returns></returns>
    public static List<int> ToList<T>(this IList<T> @this, Func<T, int> func)
    {
        List<int> result = new List<int>();
        @this.ForEach(delegate (T x)
        {
            result.Add(func(x));
        });
        return result;
    }

    /// <summary>
    /// ToLongDateString
    /// </summary>
    /// <param name="this"></param>
    /// <param name="culture"></param>
    /// <returns></returns>
    public static string ToLongDateString(this DateTime @this, CultureInfo culture)
    {
        return @this.ToString("D", culture);
    }

    /// <summary>
    /// ToLongDateString
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static string ToLongDateString(this DateTime @this)
    {
        return @this.ToString("D", DateTimeFormatInfo.CurrentInfo);
    }

    /// <summary>
    /// ToLongDateString
    /// </summary>
    /// <param name="this"></param>
    /// <param name="culture"></param>
    /// <returns></returns>
    public static string ToLongDateString(this DateTime @this, string culture)
    {
        return @this.ToString("D", new CultureInfo(culture));
    }

    /// <summary>
    /// ToLongDateTimeString
    /// </summary>
    /// <param name="this"></param>
    /// <param name="culture"></param>
    /// <returns></returns>
    public static string ToLongDateTimeString(this DateTime @this, CultureInfo culture)
    {
        return @this.ToString("F", culture);
    }

    /// <summary>
    /// ToLongDateTimeString
    /// </summary>
    /// <param name="this"></param>
    /// <param name="culture"></param>
    /// <returns></returns>
    public static string ToLongDateTimeString(this DateTime @this, string culture)
    {
        return @this.ToString("F", new CultureInfo(culture));
    }

    /// <summary>
    /// ToLongDateTimeString
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static string ToLongDateTimeString(this DateTime @this)
    {
        return @this.ToString("F", DateTimeFormatInfo.CurrentInfo);
    }

    /// <summary>
    /// ToRelativeTime
    /// </summary>
    /// <param name="dt"></param>
    /// <param name="includeTime"></param>
    /// <param name="asPlusMinus"></param>
    /// <param name="compareTo"></param>
    /// <param name="includeSign"></param>
    /// <returns></returns>
    public static string ToRelativeTime(this DateTime dt, bool includeTime = true, bool asPlusMinus = false, DateTime? compareTo = null, bool includeSign = true)
    {
        DateTime dateTime = compareTo ?? DateTime.Now;
        if (asPlusMinus)
        {
            return (dt <= dateTime) ? ToRelativeTimeSimple(dateTime - dt, includeSign ? "-" : "") : ToRelativeTimeSimple(dt - dateTime, includeSign ? "+" : "");
        }
        return (dt <= dateTime) ? ToRelativeTimePast(dt, dateTime, includeTime) : ToRelativeTimeFuture(dt, dateTime, includeTime);
    }

    /// <summary>
    /// ToRFC1123String
    /// </summary>
    /// <param name="this"></param>
    /// <param name="culture"></param>
    /// <returns></returns>
    public static string ToRFC1123String(this DateTime @this, CultureInfo culture)
    {
        return @this.ToString("r", culture);
    }

    /// <summary>
    /// ToRFC1123String
    /// </summary>
    /// <param name="this"></param>
    /// <param name="culture"></param>
    /// <returns></returns>
    public static string ToRFC1123String(this DateTime @this, string culture)
    {
        return @this.ToString("r", new CultureInfo(culture));
    }

    /// <summary>
    /// ToRFC1123String
    /// </summary>
    /// <param name="this"></param>
    /// <returns></returns>
    public static string ToRFC1123String(this DateTime @this)
    {
        return @this.ToString("r", DateTimeFormatInfo.CurrentInfo);
    }

    /// <summary>
    /// ToString
    /// </summary>
    /// <param name="this"></param>
    /// <param name="trueValue"></param>
    /// <param name="falseValue"></param>
    /// <returns></returns>
    public static string ToString(this bool @this, string trueValue, string falseValue)
    {
        return @this ? trueValue : falseValue;
    }

    /// <summary>
    /// ToSystemDataIsolationLevel
    /// </summary>
    /// <param name="isolationLevel"></param>
    /// <returns></returns>
    public static IsolationLevel ToSystemDataIsolationLevel(this System.Transactions.IsolationLevel isolationLevel)
    {
        switch (isolationLevel)
        {
            case System.Transactions.IsolationLevel.Chaos:
                return IsolationLevel.Chaos;
            case System.Transactions.IsolationLevel.ReadCommitted:
                return IsolationLevel.ReadCommitted;
            case System.Transactions.IsolationLevel.ReadUncommitted:
                return IsolationLevel.ReadUncommitted;
            case System.Transactions.IsolationLevel.RepeatableRead:
                return IsolationLevel.RepeatableRead;
            case System.Transactions.IsolationLevel.Serializable:
                return IsolationLevel.Serializable;
            case System.Transactions.IsolationLevel.Snapshot:
                return IsolationLevel.Snapshot;
            case System.Transactions.IsolationLevel.Unspecified:
                return IsolationLevel.Unspecified;
            default:
                throw new Exception("Unknown isolation level: " + isolationLevel);
        }
    }

    /// <summary>
    /// TrimEnd
    /// </summary>
    /// <param name="value"></param>
    /// <param name="forRemoving"></param>
    /// <returns></returns>
    public static string TrimEnd(this string value, string forRemoving)
    {
        if (string.IsNullOrEmpty(value))
        {
            return value;
        }
        if (string.IsNullOrEmpty(forRemoving))
        {
            return value;
        }
        while (value.EndsWith(forRemoving, StringComparison.InvariantCultureIgnoreCase))
        {
            value = value.Remove(value.LastIndexOf(forRemoving, StringComparison.InvariantCultureIgnoreCase));
        }
        return value;
    }

    #endregion

    #region U

    /// <summary>
    /// UrlDecode
    /// </summary>
    /// <param name="str"></param>
    /// <returns></returns>
    public static string UrlDecode(this string str)
    {
        return HttpUtility.UrlDecode(str);
    }

    /// <summary>
    /// UrlDecode
    /// </summary>
    /// <param name="str"></param>
    /// <param name="e"></param>
    /// <returns></returns>
    public static string UrlDecode(this string str, Encoding e)
    {
        return HttpUtility.UrlDecode(str, e);
    }

    /// <summary>
    /// UrlEncode
    /// </summary>
    /// <param name="str"></param>
    /// <returns></returns>
    public static string UrlEncode(this string str)
    {
        return HttpUtility.UrlEncode(str);
    }

    /// <summary>
    /// UrlEncode
    /// </summary>
    /// <param name="str"></param>
    /// <param name="e"></param>
    /// <returns></returns>
    public static string UrlEncode(this string str, Encoding e)
    {
        return HttpUtility.UrlEncode(str, e);
    }

    #endregion

    #region W

    /// <summary>
    /// WhereIf
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="query"></param>
    /// <param name="condition"></param>
    /// <param name="predicate"></param>
    /// <returns></returns>
    public static IQueryable<T> WhereIf<T>(this IQueryable<T> query, bool condition, Expression<Func<T, int, bool>> predicate)
    {
        return condition ? query.Where(predicate) : query;
    }

    /// <summary>
    /// WhereIf
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="query"></param>
    /// <param name="condition"></param>
    /// <param name="predicate"></param>
    /// <returns></returns>
    public static IQueryable<T> WhereIf<T>(this IQueryable<T> query, bool condition, Expression<Func<T, bool>> predicate)
    {
        return condition ? query.Where(predicate) : query;
    }

    /// <summary>
    /// WhereFilter:通过指定表达式过滤集合
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="source"></param>
    /// <param name="where"></param>
    /// <returns></returns>
    public static IEnumerable<T> WhereFilter<T>(this IEnumerable<T> source, Func<T, bool> where)
    {
        foreach (T item in source)
        {
            if (where(item))
                yield return item;
        }
    }

    #endregion

    #region Private

    /// <summary>
    /// ToRelativeTimeSimple
    /// </summary>
    /// <param name="ts"></param>
    /// <param name="sign"></param>
    /// <returns></returns>
    private static string ToRelativeTimeSimple(TimeSpan ts, string sign)
    {
        double totalSeconds = ts.TotalSeconds;
        if (totalSeconds < 1.0)
        {
            return "1秒前";
        }
        if (totalSeconds < 60.0)
        {
            return sign + ts.Seconds.ToString() + "秒";
        }
        if (totalSeconds < 3600.0)
        {
            return sign + ts.Minutes.ToString() + "分钟";
        }
        if (totalSeconds < 86400.0)
        {
            return sign + ts.Hours.ToString() + "小时";
        }
        return ts.Days.ToString() + "天" + ((sign == "-") ? "前" : "后");
    }

    /// <summary>
    /// ToRelativeTimePast
    /// </summary>
    /// <param name="dt"></param>
    /// <param name="utcNow"></param>
    /// <param name="includeTime"></param>
    /// <returns></returns>
    private static string ToRelativeTimePast(DateTime dt, DateTime utcNow, bool includeTime = true)
    {
        TimeSpan timeSpan = utcNow - dt;
        double totalSeconds = timeSpan.TotalSeconds;
        if (totalSeconds < 1.0)
        {
            return "刚刚";
        }
        if (totalSeconds < 60.0)
        {
            return (timeSpan.Seconds == 1) ? "1秒前" : (timeSpan.Seconds.ToString() + "秒前");
        }
        if (totalSeconds < 3600.0)
        {
            return (timeSpan.Minutes == 1) ? "1分钟前" : (timeSpan.Minutes.ToString() + "分钟前");
        }
        if (totalSeconds < 86400.0)
        {
            return (timeSpan.Hours == 1) ? "1小时前" : (timeSpan.Hours.ToString() + "小时前");
        }
        int days = timeSpan.Days;
        if (days == 1)
        {
            return "昨天";
        }
        if (days <= 2)
        {
            return days.ToString() + "天前";
        }
        if (utcNow.Year == dt.Year)
        {
            return dt.ToString(includeTime ? "MM-dd HH:mm" : "MM-dd");
        }
        return dt.ToString(includeTime ? "yyyy-MM-dd HH:mm" : "yyyy-MM-dd");
    }

    /// <summary>
    /// ToRelativeTimeFuture
    /// </summary>
    /// <param name="dt"></param>
    /// <param name="utcNow"></param>
    /// <param name="includeTime"></param>
    /// <returns></returns>
    private static string ToRelativeTimeFuture(DateTime dt, DateTime utcNow, bool includeTime = true)
    {
        TimeSpan timeSpan = dt - utcNow;
        double totalSeconds = timeSpan.TotalSeconds;
        if (totalSeconds < 1.0)
        {
            return "刚刚";
        }
        if (totalSeconds < 60.0)
        {
            return (timeSpan.Seconds == 1) ? "1秒后" : (timeSpan.Seconds.ToString() + "秒后");
        }
        if (totalSeconds < 3600.0)
        {
            return (timeSpan.Minutes == 1) ? "1分钟后" : (timeSpan.Minutes.ToString() + "分钟后");
        }
        if (totalSeconds < 86400.0)
        {
            return (timeSpan.Hours == 1) ? "1小时后" : (timeSpan.Hours.ToString() + "小时后");
        }
        int num = (int)Math.Round(timeSpan.TotalDays, 0);
        if (num == 1)
        {
            return "明天";
        }
        if (num <= 10)
        {
            return num.ToString() + "天后" + ((num > 1) ? "s" : "");
        }
        if (utcNow.Year == dt.Year)
        {
            return dt.ToString(includeTime ? "MM-dd HH:mm" : "MM-dd");
        }
        return dt.ToString(includeTime ? "yyyy-MM-dd HH:mm" : "yyyy-MM-dd");
    }

    /// <summary>
    /// SortByDependenciesVisit
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="item"></param>
    /// <param name="getDependencies"></param>
    /// <param name="sorted"></param>
    /// <param name="visited"></param>
    private static void SortByDependenciesVisit<T>(T item, Func<T, IEnumerable<T>> getDependencies, List<T> sorted, Dictionary<T, bool> visited)
    {
        if (visited.TryGetValue(item, out bool value))
        {
            if (value)
            {
                throw new ArgumentException("Cyclic dependency found! Item: " + item);
            }
            return;
        }
        visited[item] = true;
        IEnumerable<T> enumerable = getDependencies(item);
        if (enumerable != null)
        {
            foreach (T item2 in enumerable)
            {
                SortByDependenciesVisit(item2, getDependencies, sorted, visited);
            }
        }
        visited[item] = false;
        sorted.Add(item);
    }

    #endregion

    #region Common class

    /// <summary>
    /// TreeItem
    /// </summary>
    /// <typeparam name="T"></typeparam>
    public class TreeItem<T>
    {
        /// <summary>
        /// Item
        /// </summary>
        public T Item { get; set; }

        /// <summary>
        /// Children
        /// </summary>
        public IEnumerable<TreeItem<T>> Children { get; set; }
    }

    #endregion
}