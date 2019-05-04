// ฯ๊ว้าณ
var id = window.location.pathname.replace(/[/p.html]/g, "");
if (!/^\+?[1-9][0-9]*$/.test(id)) {
    location.href = "/";
}

var parameter = {
    url: "/article/get?id=" + id,
    callback: function (data) {
        if (data.isSuccess) {
            document.title = data.result.article.title + " - " + document.title;

            var html = template("detail_tmpl", data.result);
            document.getElementById('detail').outerHTML = html;
        } else {
            location.href = "/";
        }
    }
};
_ajax(parameter);