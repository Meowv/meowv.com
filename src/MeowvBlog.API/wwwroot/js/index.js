// ·ÖÒ³²¿·Ö
var page = {
    pageIndex: location.search.replace(/([^?&=]+)=([^&]+)/g, (_, __, page) => page).replace("?", "") || 1,
    pageSize: 10
};
var parameter = {
    url: "/article/getlist?PageIndex=" + page.pageIndex + "&PageSize=" + page.pageSize,
    callback: function (data) {
        if (data.isSuccess) {
            if (data.result.items.length == 0)
                location.href = "/";

            var options = {
                size: "small",                bootstrapMajorVersion: 3,
                currentPage: page.pageIndex,
                numberOfPages: 5,
                totalPages: Math.ceil(data.result.totalCount / page.pageSize),
                pageUrl: function (_, page, current) {
                    if (page == current) return "javascript:;";
                    return location.origin + "/?page=" + page;
                },
                tooltipTitles: function () { }
            }
            $("#page").bootstrapPaginator(options);
        }
    }
};
_ajax(parameter);