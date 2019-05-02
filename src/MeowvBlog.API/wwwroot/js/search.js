// ËÑË÷ÁÐ±í
var keywords = decodeURI(window.location.pathname.replace(/\/|search/g, ""));

var parameter = {
    url: "/article/search/query?keywords=" + keywords,
    callback: function (data) {
        if (data.isSuccess) {
            document.title = keywords + " - " + document.title;

            $("#current-keywords").text($("#current-keywords").text().replace("-", keywords));

            var html = template("articles_tmpl", { items: data.result });
            document.getElementById('articles').outerHTML = html;
        } else {
            location.href = "/";
        }
    }
};
_ajax(parameter);