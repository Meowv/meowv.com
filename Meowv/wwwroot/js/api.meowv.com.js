var meowv = function () {
    var _pageData = {

    };

    var reason = "success";

    return {
        init: function () {
            this.pageInit();
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
            loadArticle: function () {

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
                    this.method.loadArticle();
                    break;
                case "/random-article.html":
                    this.method.loadArticle();
                    break;
                case "/girl.html":
                    break;
                case "/cat.html":
                    break;
                case "/bing.html":
                    break;
            }
        }
    };
}();

$(function () {
    meowv.init();
});