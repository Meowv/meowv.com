// 分类列表
var name = window.location.pathname.replace(/\/|tags|list/g, "");
var parameter = {
    url: "/tag/article/query?name=" + name,
    callback: function (data) {
        if (data.isSuccess) {
            data.result[0].tags.forEach(function (i) {
                if (name == i.displayName) {
                    document.title = i.tagName + " - " + document.title;

                    $("#current-tag").text("TAG : " + i.tagName);
                    return;
                }
            });
           
            var html = template("articles_tmpl", { items: data.result });
            document.getElementById('articles').outerHTML = html;
        } else {
            location.href = "/";
        }
    }
};
_ajax(parameter);