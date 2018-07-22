var meowv = function () {
    var _pageData = {
        pageIndex: 0,
        city: "上海",
        key: ".net",
        isZhaopin: true,
        is51Job: true,
        isLiepin: true,
        isZhipin: true,
        isLagou: true
    };

    return {
        init: function () {
            this.pageInit();
        },
        method: {
            loadSignature: function () {

            },
            loadJobs: function () {
                this.jobsInit();

                $('.city').meowvCity();

                $('.collapsed').on('show.bs.collapse', function () {
                    console.log("fetch detail");
                });
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
                });
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
            },
            jobsInit: function () {
                var that = this;

                var jobsType = "0-1-2-3-4";
                var types = that.queryString("t") && that.queryString("t").split('-') || jobsType.split('-');

                $(".key").val(decodeURIComponent(that.queryString("key") || _pageData.key));
                $(".city").val(decodeURIComponent(that.queryString("city") || _pageData.city));

                $(":checkbox").prop("checked", false);
                types.indexOf("0") >= 0 && $("#zhaopin").prop("checked", true);
                types.indexOf("1") >= 0 && $("#51job").prop("checked", true);
                types.indexOf("2") >= 0 && $("#liepin").prop("checked", true);
                types.indexOf("3") >= 0 && $("#zhipin").prop("checked", true);
                types.indexOf("4") >= 0 && $("#lagou").prop("checked", true);

                that.resetJobs();
                
                $.each(types, function (i, e) {
                    if (e === "0")
                        that.fetchJobs("zhaopin", _pageData.city, _pageData.key, _pageData.pageIndex);
                    if (e === "1")
                        that.fetchJobs("51job", _pageData.city, _pageData.key, _pageData.pageIndex + 1);
                    if (e === "2")
                        that.fetchJobs("liepin", _pageData.city, _pageData.key, _pageData.pageIndex);
                    if (e === "3")
                        that.fetchJobs("zhipin", _pageData.city, _pageData.key, _pageData.pageIndex);
                    if (e === "4")
                        that.fetchJobs("lagou", _pageData.city, _pageData.key, _pageData.pageIndex);
                });
                
                history.pushState(null, null, location.href.split("?")[0] + "?t=" + jobsType + "&city=" + _pageData.city + "&key=" + _pageData.key + "&page=" + _pageData.pageIndex);
            },
            fetchJobs: function (type, city, key, page) {
                $.getJSON(`/jobs/${type}?city=${city}&key=${key}&index=${page}`, function (result) {
                    $("#jobs-content").append(template("jobs-template", result));
                });
            },
            resetJobs: function () {
                _pageData.pageIndex = this.queryString("page") || 0;
                _pageData.city = $(".city").val();
                _pageData.key = $(".key").val();
                _pageData.isZhaopin = $("#zhaopin").prop("checked");
                _pageData.is51Job = $("#51job").prop("checked");
                _pageData.isLiepin = $("#liepin").prop("checked");
                _pageData.isZhipin = $("#zhipin").prop("checked");
                _pageData.isLagou = $("#lagou").prop("checked");
                $("ul.collapsed").html("");
            },
            queryString: function (name) {
                var url = encodeURI(location.search);
                var theRequest = new Object();
                if (url.indexOf("?") != -1) {
                    var str = url.substr(1);
                    strs = str.split("&");
                    for (var i = 0; i < strs.length; i++) {
                        theRequest[strs[i].split("=")[0]] = unescape(strs[i].split("=")[1]);
                    }
                }
                return theRequest[name];
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
        }
    };
}();

$(function () {
    meowv.init();
});