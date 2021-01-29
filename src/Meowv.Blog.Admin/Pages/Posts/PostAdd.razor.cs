using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Dto.Blog.Params;
using Meowv.Blog.Response;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Vditor.Models;

namespace Meowv.Blog.Admin.Pages.Posts
{
    public partial class PostAdd
    {
        CreatePostInput input = new CreatePostInput();

        Toolbar toolbar = new Toolbar();

        bool visible = false;

        List<GetAdminCategoryDto> categories;

        List<GetAdminTagDto> tags;

        protected override async Task OnInitializedAsync()
        {
            string[] keys = { "emoji", "headings", "bold", "italic", "strike", "link", "|", "list", "ordered-list", "check", "outdent", "indent", "|", "quote", "line", "code", "inline-code", "insert-before", "insert-after", "|", "table", "undo", "redo", "edit-mode", "both", "preview", "outline", "code-theme", "content-theme", "export", "|" };
            toolbar.Buttons.AddRange(keys.ToList());

            var customToolButton = new CustomToolButton()
            {
                ClassName = "right",
                Hotkey = "⌘/ctrl-S",
                Icon = "<svg t='1611912437120' class='icon' viewBox='0 0 1357 1024' version='1.1' xmlns='http://www.w3.org/2000/svg' p-id='1246' width='64' height='64'><path d='M1296.749468 244.39132c26.802989-27.289989 40.869983-61.350975 42.479983-101.796958 1.322999-40.769983-11.093995-74.833969-38.255985-102.476958-26.479989-27.286989-59.479976-40.771983-98.085959-40.092984-38.930984 1-71.92997 14.837994-98.41396 42.448983L473.329806 689.969137 256.184895 469.534227c-26.479989-27.642989-59.510976-41.801983-98.41096-42.479982-38.576984-1-71.609971 12.483995-98.123959 40.123983-27.124989 27.642989-40.541983 59.996975-41.510983 97.41496-1 37.736985 12.417995 70.440971 39.256983 97.73296l310.941873 321.555868c26.838989 27.287989 61.832975 40.767983 104.991957 40.093984 43.189982-1.003 78.476968-14.808994 104.959957-42.446983l-8.482997 9.094997L1296.749468 244.39032z' p-id='1247'></path></svg>",
                Name = "save",
                Tip = "点击保存",
                TipPosition = "n"
            };
            toolbar.Buttons.Add(customToolButton);

            await base.OnInitializedAsync();
        }

        public async Task OnToolbarButtonClick(string name)
        {
            var categoryResponse = await GetResultAsync<BlogResponse<List<GetAdminCategoryDto>>>("api/meowv/blog/admin/categories");
            var tagResponse = await GetResultAsync<BlogResponse<List<GetAdminTagDto>>>("api/meowv/blog/admin/tags");

            categories = categoryResponse.Result;
            tags = tagResponse.Result;

            visible = true;
        }

        public async Task HandleSubmit()
        {

        }

        private void Close() => visible = false;
    }
}