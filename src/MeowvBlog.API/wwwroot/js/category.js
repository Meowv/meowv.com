// 分类列表
var name = window.location.pathname.replace(/\/|category|list/g, "");
var parameter = {
    url: "/category/article/query?name=" + name,
    callback: function (data) {
        if (data.isSuccess) {
            $("#current-category").text("CATEGORY : " + data.result[0].category.categoryName);

            var html = template("articles_tmpl", { items: data.result });
            document.getElementById('articles').outerHTML = html;
        } else {
            location.href = "/";
        }
    }
};
_ajax(parameter);