using Meowv.Blog.Domain.Users;
using System;
using System.Collections.Generic;

namespace Meowv.Blog.DataSeed
{
    public class DataSeedConsts
    {
        public static List<User> AdminUsers()
        {
            var users = new List<User>
            {
               new User
               {
                   Username = "admin",
                   Password = "123456".ToMd5(),
                   Name = "阿星Plus",
                   Email = "123@meowv.com",
                   Avatar = "http://q1.qlogo.cn/g?b=qq&nk=494910887&s=640",
                   IsAdmin = true
               },
               new User
               {
                   Username = "meowv",
                   Password = "123456".ToMd5(),
                   Name = "二柚",
                   Email = "wus@meowv.com",
                   Avatar = "http://q1.qlogo.cn/g?b=qq&nk=1368802693&s=640",
                   IsAdmin = true
               }
            };
            return users;
        }
    }
}