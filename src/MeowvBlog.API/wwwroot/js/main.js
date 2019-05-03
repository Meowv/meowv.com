// 返回顶部
function scroll() {
    $(window).scroll(function () {
        var scrollValue = $(window).scrollTop();
        scrollValue > 100 ? $('div[class=backtop]').fadeIn() : $('div[class=backtop]').fadeOut();
    });
    $('div[class=backtop]').click(function () {
        $("html,body").animate({
            scrollTop: 0
        }, 200);
    });
}

// 加载导航菜单的分类列表
function loadNavCategories() {
    var parameter = {
        url: "/category/get",
        callback: function (data) {
            if (data.isSuccess) {
                var html = template("categories_tmpl", data);
                document.getElementById('categories').innerHTML = html;
            }
        }
    };
    _ajax(parameter);
}

// search...
function doSearch() {
    $('#search').bind('keypress', function (event) {
        if (event.keyCode == "13") {
            event.preventDefault();
            var keywords = $("#search").val().trim();
            if (keywords.length > 0) {
                location.href = "/search/" + keywords;
            }
        }
    });
}

// 加载热门文章
function loadHotArticles() {
    var parameter = {
        url: "/article/gethot",
        callback: function (data) {
            if (data.isSuccess) {
                var html = template("hot_articles_tmpl", data);
                document.getElementById('hot_articles').innerHTML = html;
            }
        }
    };
    _ajax(parameter);
}

// 加载右侧Top标签列表
function loadTopTags() {
    var parameter = {
        url: "/tag/gettop?count=10",
        callback: function (data) {
            if (data.isSuccess) {
                var html = template("top_tags_tmpl", data);
                document.getElementById('top_tags').innerHTML = html;
            }
        }
    };
    _ajax(parameter);
}

// 友情链接
function loadFriendLinks() {
    var parameter = {
        url: "/friendlink/get",
        callback: function (data) {
            if (data.isSuccess) {
                var html = template("friendlinks_tmpl", data);
                document.getElementById('friendlinks').innerHTML = html;
            }
        }
    };
    _ajax(parameter);
}

// 设置导航菜单选中状态样式
function settingNavClicked() {
    $("#menu ul li").removeClass("active");

    var url = location.pathname;

    if (/\/p\/[1-9]\d*.html/.test(url) || /\/search\/\w*/.test(url)) {
    } else if (/\/category\/list\/*/.test(url)) {
        $("#menu ul li:eq(1)").addClass("active");
    } else if (/\/tags?(s|\/list\/\w*|\/)/.test(url)) {
        $("#menu ul li:eq(2)").addClass("active");
    } else if (/\/apps/.test(url)) {
        $("#menu ul li:eq(3)").addClass("active");
    } else {
        $("#menu ul li:eq(0)").addClass("active");
    }
}

// AJAX Service
function _ajax(parameter) {
    $.ajax({
        type: parameter.type || "GET",
        url: parameter.url,
        contentType: "application/json; charset=utf-8",
        async: true,
        cache: false,
        dataType: "json",
        data: JSON.stringify(parameter.data),
        success: function (data) {
            parameter.callback(data);
        },
        error: function (data) {
            parameter.callback("Error:" + data);
        }
    });
}

$(function () {
    loadNavCategories();
    doSearch();
    loadHotArticles();
    loadTopTags();
    loadFriendLinks();
    settingNavClicked();
    scroll();
});