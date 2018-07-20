var meowv = function () {
    var _pageData = {

    };

    return {
        init: function () {
            this.pageInit();
            this.bindEvent();
        },
        method: {
            loadSignature: function () {

            },
            loadJobs: function () {

            },
            loadBlogs: function () {
                $.getJSON('/blog', function (result) {
                    $("#blog-content").html(template("blog-template", result));
                });            },
            loadNews: function () {

            },
            loadArticle: function (article) {
                $.getJSON(`/article/${article}`, function (result) {
                    $("#article-content").html(template("article-template", result));
                });
            },
            loadGirl: function () {

            },
            loadCat: function () {

            },
            loadBing: function () {

            }
        },
        pageInit: function () {
            switch (window.location.pathname) {
                case "/":
                    this.method.loadSignature();
                    break;
                case "/index.html":
                    this.method.loadSignature();
                    break;
                case "/job.html":
                    this.method.loadJobs();
                    break;
                case "/blog.html":
                    this.method.loadBlogs();
                    break;
                case "/news.html":
                    this.method.loadNews();
                    break;
                case "/article.html":
                    this.method.loadArticle('today');
                    break;
                case "/random-article.html":
                    this.method.loadArticle('random');
                    break;
                case "/girl.html":
                    break;
                case "/cat.html":
                    break;
                case "/bing.html":
                    break;
            }
        },
        bindEvent: function () {
            // 继续阅读
            $("html").on("click", ".random button", function () {
                location.href = "/random-article.html";
            });
        }
    };
}();

$(function () {
    meowv.init();
});