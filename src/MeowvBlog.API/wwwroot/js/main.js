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
    loadTopTags();
    scroll();
});