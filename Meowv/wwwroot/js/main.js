var meowv = function () {
    var _pageData = {
        pageIndex: 1,
        city: "上海",
        key: "ASP.NET Core",
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
                var that = this;

                var clickCount = 1;
                $('#signature').on('click', function () {
                    if (clickCount >= 8) {
                        location.href = "/v1/index.html";
                    }
                    clickCount++;
                });

                $('#btnSignature').on('click', function () {
                    var name = $('#name').val();
                    var type = $('option:selected').val();
                    var sign_api = "/signature/" + (type > 0 ? "biz" : "art") + "?name=" + name;
                    var token = that.getCookie('token');
                    if (name.length > 0) {
                        $.ajax({
                            type: "get",
                            url: sign_api,
                            beforeSend: function (request) {
                                request.setRequestHeader("Authorization", "Bearer " + token);
                            },
                            success: function (result) {
                                if (result.reason === "success") {
                                    $('#signature').attr('src', result.result.url);
                                }
                            }
                        });
                    }
                });
            },
            loadJobs: function () {
                var that = this;

                that.jobsInit();

                $('.city').meowvCity();

                $('#jobs-content').on('show.bs.collapse', function (index) {
                    var type = $(index.target).attr("id").split("-")[0];
                    var detail_url = $(index.target).parent(".list-group-item.blog-title").find("a").data("link");
                    var element = $(index.target).children();

                    $(element).html(template("jobs-loading-template", null));

                    if (type === "智联招聘")
                        type = "zhaopin_detail";
                    if (type === "前程无忧")
                        type = "51job_detail";
                    if (type === "猎聘网")
                        type = "liepin_detail";
                    if (type === "Boss直聘")
                        type = "zhipin_detail";
                    if (type === "拉勾网")
                        type = "lagou_detail";
                    
                    that.fetchJobDetail(type, detail_url, element);
                });

                var _reloadJobs = function () {
                    that.resetJobs();
                    that.reloadJobs();
                };

                $(".btn-search").click(function () {
                    _reloadJobs();
                    $("ul.collapsed").html("");
                });

                $(":checkbox").click(function () {
                    _reloadJobs();
                    $("ul.collapsed").html("");
                });

                $(".key").keydown(function (event) {
                    if (event.keyCode === 13) {
                        _reloadJobs();
                        $("ul.collapsed").html("");
                    }
                });

                if (history.pushState) {
                    window.addEventListener("popstate", function () { });
                }

                $(window).scroll(function () {
                    var scrollTop = $(window).scrollTop();
                    var top = $(document).height() - $(window).height() - scrollTop;
                    if (top === 0) {
                        _pageData.pageIndex++;
                        that.reloadJobs();
                    }
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
                jobsType = types.join('-');

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
                        that.fetchJobs("51job", _pageData.city, _pageData.key, _pageData.pageIndex);
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
                $("ul.collapsed").append(template("jobs-loading-template", null));

                $.getJSON(`/jobs/${type}?city=${city}&key=${key}&index=${page}`, function (result) {
                    template.defaults.imports.page = page;
                    $("#jobs-content").append(template("jobs-template", result));
                    $("ul.collapsed>img").remove();
                });
            },
            fetchJobDetail: function (type, detailUrl, element) {
                template.defaults.imports.url = detailUrl;
                $.getJSON(`/jobs/${type}?url=${detailUrl}`, function (result) {
                    $(element).html(template("job-detail-template", result));
                });
            },
            resetJobs: function () {
                _pageData.pageIndex = 1;
                _pageData.city = $(".city").val();
                _pageData.key = $(".key").val();
                _pageData.isZhaopin = $("#zhaopin").prop("checked");
                _pageData.is51Job = $("#51job").prop("checked");
                _pageData.isLiepin = $("#liepin").prop("checked");
                _pageData.isZhipin = $("#zhipin").prop("checked");
                _pageData.isLagou = $("#lagou").prop("checked");

                $("ul.collapsed").append(template("jobs-loading-template", null));
            },
            reloadJobs: function () {
                var jobsType = "";
                if (_pageData.isZhaopin) {
                    jobsType += "0-";
                    this.fetchJobs("zhaopin", _pageData.city, _pageData.key, _pageData.pageIndex);
                }
                if (_pageData.is51Job) {
                    jobsType += "1-";
                    this.fetchJobs("51job", _pageData.city, _pageData.key, _pageData.pageIndex);
                }
                if (_pageData.isLiepin) {
                    jobsType += "2-";
                    this.fetchJobs("liepin", _pageData.city, _pageData.key, _pageData.pageIndex);
                }
                if (_pageData.isZhipin) {
                    jobsType += "3-";
                    this.fetchJobs("zhipin", _pageData.city, _pageData.key, _pageData.pageIndex);
                }
                if (_pageData.isLagou) {
                    jobsType += "4-";
                    this.fetchJobs("lagou", _pageData.city, _pageData.key, _pageData.pageIndex);
                }

                jobsType = jobsType.substring(0, jobsType.length - 1);

                history.pushState(null, null, location.href.split("?")[0] + "?t=" + jobsType + "&city=" + _pageData.city + "&key=" + _pageData.key + "&page=" + _pageData.pageIndex);
            },
            queryString: function (name) {
                var url = encodeURI(location.search);
                var request = new Object();
                if (url.indexOf("?") !== -1) {
                    var str = url.substr(1);
                    strs = str.split("&");
                    for (var i = 0; i < strs.length; i++) {
                        request[strs[i].split("=")[0]] = unescape(strs[i].split("=")[1]);
                    }
                }
                return request[name];
            },
            getCookie(key) {
                var arr, reg = new RegExp("(^| )" + key + "=([^;]*)(;|$)");
                if (arr = document.cookie.match(reg))
                    return unescape(arr[2]);
                else
                    return null;
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