using System;
using System.Collections.Generic;
using System.Linq.Expressions;
using StackExchange.Redis;

namespace Meowv.Blog.Application.Caching
{
    /// <inheritdoc />
    /// <summary>
    /// redis更新字段表达式解析
    /// </summary>
    /// <typeparam name="T"></typeparam>
    public class RedisExpression<T> : ExpressionVisitor
    {
        #region 成员变量

        /// <summary>
        /// 更新列表
        /// </summary>
        internal List<HashEntry> HashEntryList = new List<HashEntry>();
        private string _fieldname;

        #endregion

        #region 获取更新列表

        /// <summary>
        /// 获取更新列表
        /// </summary>
        /// <param name="expression"></param>
        /// <returns></returns>
        public static HashEntry[] HashEntry(Expression<Func<T>> expression)
        {
            var redis = new RedisExpression<T>();

            redis.Resolve(expression);

            return redis.HashEntryList.ToArray();
        }

        #endregion

        #region 解析表达式

        /// <summary>
        /// 解析表达式
        /// </summary>
        /// <param name="expression"></param>
        private void Resolve(Expression<Func<T>> expression)
        {
            Visit(expression);
        }

        #endregion

        #region 访问对象初始化表达式

        /// <inheritdoc />
        /// <summary>
        /// 访问对象初始化表达式
        /// </summary>
        /// <param name="node"></param>
        /// <returns></returns>
        protected override Expression VisitMemberInit(MemberInitExpression node)
        {
            var bingdings = node.Bindings;

            foreach (var item in bingdings)
            {
                var memberAssignment = (MemberAssignment)item;
                _fieldname = item.Member.Name;

                if (memberAssignment.Expression.NodeType == ExpressionType.MemberInit)
                {
                    var lambda = Expression.Lambda<Func<object>>(Expression.Convert(node, typeof(object)));
                    var value = lambda.Compile().Invoke();
                    HashEntryList.Add(new HashEntry(_fieldname, value.ToString()));
                }
                else
                {
                    Visit(memberAssignment.Expression);
                }
            }
            return node;
        }

        #endregion

        #region 访问常量表达式

        /// <inheritdoc />
        /// <summary>
        /// 访问常量表达式
        /// </summary>
        /// <param name="node"></param>
        /// <returns></returns>
        protected override Expression VisitConstant(ConstantExpression node)
        {
            var value = node.Type.IsEnum ? (int)node.Value : node.Value;

            HashEntryList.Add(new HashEntry(_fieldname, value.ToString()));

            return node;
        }
        #endregion

        #region 访问成员表达式

        /// <inheritdoc />
        /// <summary>
        /// 访问成员表达式
        /// </summary>
        /// <param name="node"></param>
        /// <returns></returns>
        protected override Expression VisitMember(MemberExpression node)
        {
            var lambda = Expression.Lambda<Func<object>>(Expression.Convert(node, typeof(object)));
            var value = lambda.Compile().Invoke();

            HashEntryList.Add(new HashEntry(_fieldname, value.ToString()));

            return node;
        }

        #endregion
    }
}