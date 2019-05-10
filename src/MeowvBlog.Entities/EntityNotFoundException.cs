using MeowvBlog.Core;
using System;
using System.Runtime.Serialization;

namespace MeowvBlog.Entities
{
    /// <summary>
    /// EntityNotFoundException
    /// </summary>
    [Serializable]
    public class EntityNotFoundException : BaseException
    {
        /// <summary>
        /// EntityType
        /// </summary>
        public Type EntityType { get; set; }

        /// <summary>
        /// Id
        /// </summary>
        public object Id { get; set; }

        /// <summary>
        /// EntityNotFoundException
        /// </summary>
        public EntityNotFoundException()
        {
        }

        /// <summary>
        /// EntityNotFoundException
        /// </summary>
        /// <param name="serializationInfo"></param>
        /// <param name="context"></param>
        public EntityNotFoundException(SerializationInfo serializationInfo, StreamingContext context)
            : base(serializationInfo, context)
        {
        }

        /// <summary>
        /// EntityNotFoundException
        /// </summary>
        /// <param name="entityType"></param>
        /// <param name="id"></param>
        public EntityNotFoundException(Type entityType, object id)
            : this(entityType, id, null)
        {
        }

        /// <summary>
        /// EntityNotFoundException
        /// </summary>
        /// <param name="entityType"></param>
        /// <param name="id"></param>
        /// <param name="innerException"></param>
        public EntityNotFoundException(Type entityType, object id, Exception innerException)
            : base($"There is no such an entity. Entity type: {entityType.FullName}, id: {id}", innerException)
        {
            EntityType = entityType;
            Id = id;
        }

        /// <summary>
        /// EntityNotFoundException
        /// </summary>
        /// <param name="message"></param>
        public EntityNotFoundException(string message)
            : base(message)
        {
        }

        /// <summary>
        /// EntityNotFoundException
        /// </summary>
        /// <param name="message"></param>
        /// <param name="innerException"></param>
        public EntityNotFoundException(string message, Exception innerException)
            : base(message, innerException)
        {
        }
    }
}