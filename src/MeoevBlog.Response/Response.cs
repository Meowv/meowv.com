using MeowvBlog.CodeAnnotations;
using System;

namespace MeoevBlog.Response
{
    [Serializable]
    public class Response
    {
        public string Code { get; set; } = "";

        public string Message { get; set; } = "";

        public DateTime Timestamp { get; set; } = DateTime.Now;

        public bool IsSuccess => string.IsNullOrEmpty(Code);

        public void SetMessage(ResponseStatusCode code)
        {
            SetMessage(code, code.ToAlias());
        }

        public void SetMessage(ResponseStatusCode code, string message)
        {
            SetMessage(((int)code).ToString(), message);
        }

        public void SetMessage(string code, string message)
        {
            Code = code;
            Message = message;
        }

        public void HandleException(Exception ex)
        {
            SetMessage(ResponseStatusCode.InternalServerError, ex.Message);
        }
    }
}