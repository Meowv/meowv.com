// 分类列表
//var parameter = {
//    url: "/category/article/query?name=" + window.location.pathname.replace(/\/|category|list/g, ""),
//    callback: function (data) {
//        if (data.isSuccess) {
//            $("#current-category").text("CATEGORY : " + data.result[0].category.categoryName);

//            var html = template("tags_tmpl", { items: data.result });
//            document.getElementById('tags').outerHTML = html;
//        } else {
//            location.href = "/";
//        }
//    }
//};
//_ajax(parameter);