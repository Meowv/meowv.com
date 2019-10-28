using MeowvBlog.Core;
using MeowvBlog.Core.Domain.PopKart;
using MeowvBlog.Core.Dto;
using MeowvBlog.Core.Dto.PopKart;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Extension = MeowvBlog.API.Extensions.Extensions;

namespace MeowvBlog.API.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Produces("application/json")]
    [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v3)]
    public class PopKartController : ControllerBase
    {
        private readonly List<Kart> _karts;

        public PopKartController()
        {
            _karts = new List<Kart>
            {
                new Kart { Name = "蔷薇棉花糖",Type = PopKartType.竞速, Rarity = PopKartRarity.传说,Properties = "757,762,794,743,833" },
                new Kart { Name = "光明骑士", Type = PopKartType.竞速, Rarity = PopKartRarity.传说, Properties = "808,804,796,752,835" },
                new Kart { Name = "亚特兰斯", Type = PopKartType.竞速, Rarity = PopKartRarity.传说, Properties = "782,777,764,740,841" },
                new Kart { Name = "绯红尖峰", Type = PopKartType.竞速, Rarity = PopKartRarity.传说, Properties = "751,772,802,743,835" },
                new Kart { Name = "赤炎魔怪", Type = PopKartType.竞速, Rarity = PopKartRarity.传说, Properties = "783,794,809,762,758" },
                new Kart { Name = "飞龙刀", Type = PopKartType.竞速, Rarity = PopKartRarity.传说, Properties = "770,746,794,650,880" },
                new Kart { Name = "黄金敞篷跑车", Type = PopKartType.竞速, Rarity = PopKartRarity.传说, Properties = "777,737,769,702,731" },
                new Kart { Name = "飓风", Type = PopKartType.竞速, Rarity = PopKartRarity.传说, Properties = "752,749,769,787,731" },
                new Kart { Name = "New R8御剑版", Type = PopKartType.竞速, Rarity = PopKartRarity.传说, Properties = "758,746,806,770,720" },
                new Kart { Name = "尖峰", Type = PopKartType.竞速, Rarity = PopKartRarity.史诗, Properties = "612,703,704,700,679" },
                new Kart { Name = "金猪祈福车", Type = PopKartType.竞速, Rarity = PopKartRarity.史诗, Properties = "681,721,742,787,679" },
                new Kart { Name = "刀峰", Type = PopKartType.竞速, Rarity = PopKartRarity.史诗, Properties = "716,713,702,723,697" },
                new Kart { Name = "青钢剑", Type = PopKartType.竞速, Rarity = PopKartRarity.史诗, Properties = "630,675,599,723,740" },
                new Kart { Name = "爆裂", Type = PopKartType.竞速, Rarity = PopKartRarity.史诗, Properties = "676,684,682,784,654" },
                new Kart { Name = "创世", Type = PopKartType.竞速, Rarity = PopKartRarity.史诗, Properties = "705,703,723,723,695" },
                new Kart { Name = "紫色流星", Type = PopKartType.竞速, Rarity = PopKartRarity.史诗, Properties = "696,669,671,723,645" },
                new Kart { Name = "熊猫", Type = PopKartType.竞速, Rarity = PopKartRarity.史诗, Properties = "676,689,704,718,671" },
                new Kart { Name = "洛迪敞篷跑车", Type = PopKartType.竞速, Rarity = PopKartRarity.史诗, Properties = "671,677,671,723,645" },
                new Kart { Name = "冲锋战士", Type = PopKartType.竞速, Rarity = PopKartRarity.史诗, Properties = "680,716,723,704,670" },
                new Kart { Name = "雷霆", Type = PopKartType.竞速, Rarity = PopKartRarity.史诗, Properties = "661,713,723,723,654" },
                new Kart { Name = "马拉松", Type = PopKartType.竞速, Rarity = PopKartRarity.史诗, Properties = "666,655,648,784,617" },
                new Kart { Name = "合金", Type = PopKartType.竞速, Rarity = PopKartRarity.史诗, Properties = "620,662,660,784,627" },
                new Kart { Name = "敞篷老爷车", Type = PopKartType.竞速, Rarity = PopKartRarity.史诗, Properties = "685,669,671,743,636" },
                new Kart { Name = "spyder", Type = PopKartType.竞速, Rarity = PopKartRarity.史诗, Properties = "640,697,704,784,645" },
                new Kart { Name = "突袭", Type = PopKartType.竞速, Rarity = PopKartRarity.稀有, Properties = "483,544,552,608,517" },
                new Kart { Name = "威龙", Type = PopKartType.竞速, Rarity = PopKartRarity.稀有, Properties = "505,512,536,608,504" },
                new Kart { Name = "新手练习车", Type = PopKartType.竞速, Rarity = PopKartRarity.普通, Properties = "450,450,450,450,450" },
                new Kart { Name = "独角兽", Type = PopKartType.道具, Rarity = PopKartRarity.传说, Properties = "670,708,733,707,662" },
                new Kart { Name = "正义", Type = PopKartType.道具, Rarity = PopKartRarity.传说, Properties = "746,728,790,634,717" },
                new Kart { Name = "猫咪", Type = PopKartType.道具, Rarity = PopKartRarity.传说, Properties = "665,706,674,736,645" },
                new Kart { Name = "龟龟车", Type = PopKartType.道具, Rarity = PopKartRarity.史诗, Properties = "633,638,635,644,607" },
                new Kart { Name = "马桶车", Type = PopKartType.道具, Rarity = PopKartRarity.史诗, Properties = "633,638,635,644,607" },
                new Kart { Name = "驯鹿", Type = PopKartType.道具, Rarity = PopKartRarity.史诗, Properties = "637,645,648,674,607" },
                new Kart { Name = "香蕉车", Type = PopKartType.道具, Rarity = PopKartRarity.史诗, Properties = "569,627,623,608,597" },
                new Kart { Name = "月饼配送车", Type = PopKartType.道具, Rarity = PopKartRarity.史诗, Properties = "615,666,659,608,634" },
                new Kart { Name = "黑妞卡丁车", Type = PopKartType.道具, Rarity = PopKartRarity.史诗, Properties = "620,645,680,608,607" },
                new Kart { Name = "宝宝卡丁车", Type = PopKartType.道具, Rarity = PopKartRarity.史诗, Properties = "600,649,656,674,602" },
                new Kart { Name = "黄金海盗船", Type = PopKartType.道具, Rarity = PopKartRarity.史诗, Properties = "632,669,671,608,636" },
                new Kart { Name = "银月剑", Type = PopKartType.道具, Rarity = PopKartRarity.史诗, Properties = "600,675,616,723,758" },
                new Kart { Name = "皮蛋卡丁车", Type = PopKartType.道具, Rarity = PopKartRarity.稀有, Properties = "467,539,552,608,504" }
            };
        }

        /// <summary>
        /// 获取卡丁车的赛车类型列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("type")]
        [ResponseCache(CacheProfileName = "default")]
        public async Task<Response<IList<EnumResponse>>> GetPopKartTypeAsync()
        {
            var response = new Response<IList<EnumResponse>>();
            var result = Extension.EnumToList<PopKartType>();
            response.Result = result;
            return await Task.FromResult(response);
        }

        /// <summary>
        /// 获取卡丁车的赛车稀有度列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("rarity")]
        [ResponseCache(CacheProfileName = "default")]
        public async Task<Response<IList<EnumResponse>>> GetPopKartRarityAsync()
        {
            var response = new Response<IList<EnumResponse>>();
            var result = Extension.EnumToList<PopKartRarity>();
            response.Result = result;
            return await Task.FromResult(response);
        }

        /// <summary>
        /// 按条件查询卡丁车数据
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("query")]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "name", "type", "rarity" })]
        public async Task<Response<IList<KartDto>>> QueryPopKartsAsync([FromQuery] QueryPopKartInput input)
        {
            var response = new Response<IList<KartDto>>();

            IEnumerable<Kart> karts = _karts;
            if (!string.IsNullOrEmpty(input.Name))
            {
                karts = karts.Where(x => x.Name.Contains(input.Name));
            }
            if (input.Type > -1)
            {
                karts = karts.Where(x => (int)x.Type == input.Type);
            }
            if (input.Rarity > -1)
            {
                karts = karts.Where(x => (int)x.Rarity == input.Rarity);
            }

            var result = karts.Select(x => new KartDto
            {
                Name = x.Name,
                Type = Extension.EnumToList<PopKartType>().FirstOrDefault(t => t.Value == (int)x.Type).Description,
                Rarity = Extension.EnumToList<PopKartRarity>().FirstOrDefault(t => t.Value == (int)x.Rarity).Description,
                Properties = Array.ConvertAll(x.Properties.Split(","), Convert.ToInt32)
            }).ToList();

            response.Result = result;
            return await Task.FromResult(response);
        }
    }
}