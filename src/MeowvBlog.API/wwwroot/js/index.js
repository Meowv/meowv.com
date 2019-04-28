// ∑÷“≥≤ø∑÷
var options = {
    size: "small",    bootstrapMajorVersion: 3,
    currentPage: 1,
    numberOfPages: 5,
    totalPages: 100,
    pageUrl: function (type, page, current) {
        if (page == current) return "javascript:;";
        return location.origin + "/?page=" + page;
    },
    tooltipTitles: function () { },
    onPageClicked: function (e, originalEvent, type, page) {

    }
}
$("#page").bootstrapPaginator(options);