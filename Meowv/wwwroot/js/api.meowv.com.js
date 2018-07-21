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
                

                $('.collapsed').on('show.bs.collapse', function () {
                    console.log("1")
                })
            },
            loadBlogs: function () {
                $.getJSON('/blog', function (result) {
                    $("#blog-content").html(template("blog-template", result));
                });
            },
            loadNews: function () {
                [].slice.call(document.querySelectorAll('.tabs')).forEach(function (el) {
                    new meowvTabs(el);
                });
                $('.tab').click(function () {
                    var idx = $('.tab').index(this);
                    var api = $('.tab:eq(' + idx + ')').attr("href").replace("#", "");
                    $.getJSON(`/news/${api}`, function (result) {
                        $("#" + api + " ul").html(template("news-template", result));
                    });
                })
                $('.tab:eq(0)').click();
            },
            loadArticle: function (article) {
                $.getJSON(`/article/${article}`, function (result) {
                    $("#article-content").html(template("article-template", result));
                });
                $("html").on("click", ".random button", function () {
                    location.href = "/random-article.html";
                });
            },
            loadGirl: function () {
                $('#girl-content').append("<img src='/girl' />");
            },
            loadCat: function () {
                $('#cat-content').append("<img src='/cat' />");
            },
            loadBing: function () {
                $('#bing-content').append("<img src='/bing' />");
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
                    this.method.loadGirl();
                    break;
                case "/cat.html":
                    this.method.loadCat();
                    break;
                case "/bing.html":
                    this.method.loadBing();
                    break;
            }
        },
        bindEvent: function () {
            
        }
    };
}();

$(function () {
    meowv.init();
});