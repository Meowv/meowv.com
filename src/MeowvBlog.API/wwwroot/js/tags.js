// 分类列表
var parameter = {
    url: "/tag/get",
    callback: function (data) {
        if (data.isSuccess) {
            document.title = "Tags - " + document.title;

            var html = template("tags_tmpl", data);
            document.getElementById('tags').innerHTML = html;
        }
    }
};
_ajax(parameter);