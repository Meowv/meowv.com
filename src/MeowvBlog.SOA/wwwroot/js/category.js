// 分类列表
var parameter = {
    url: "/category/article/query?name=" + window.location.pathname.replace(/\/|category|list/g, ""),
    callback: function (data) {
        if (data.isSuccess) {
            var categoryName = data.result[0].category.categoryName;

            document.title = categoryName + " - " + document.title;

            $("#current-category").text("CATEGORY : " + categoryName);

            var html = template("articles_tmpl", { items: data.result });
            document.getElementById('articles').outerHTML = html;
        } else {
            location.href = "/";
        }
    }
};
_ajax(parameter);