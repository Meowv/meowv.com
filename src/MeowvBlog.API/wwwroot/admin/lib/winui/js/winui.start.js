/**

 @Name：winui.start 开始菜单模块
 @Author：Leo
 @License：MIT
    
 */
layui.define(['jquery', 'element', 'layer', 'winui'], function (exports) {
    "use strict";

    var $ = layui.jquery,
        element = layui.element;;

    //开始菜单构造函数
    var Menu = function (options) {
        this.options = options || {
            url: winui.path + 'json/allmenu.json',
            method: 'get'
        };
        this.data = null;
    };

    //渲染HTML
    Menu.prototype.render = function (callback) {
        if (this.data === null) return;
        var html = '';
        $(this.data).each(function (index, item) {
            var id = (item.id == '' || item.id == undefined) ? '' : 'win-id="' + item.id + '"',
                url = (item.pageURL == '' || item.pageURL == undefined) ? '' : 'win-url="' + item.pageURL + '"',
                title = (item.title == '' || item.title == undefined) ? '' : 'win-title="' + item.title + '"',
                opentype = (item.openType == '' || item.openType == undefined) ? '' : 'win-opentype="' + item.openType + '"',
                maxopen = (item.maxOpen == '' || item.maxOpen == undefined) ? '' : 'win-maxopen="' + item.maxOpen + '"',
                winIcon = (item.icon == '' || item.icon == undefined) ? '' : 'win-icon="' + item.icon + '"',
                extend = item.extend ? ' layui-nav-itemed' : '',
                isParent = item.childs ? ' parent' : '',
                //icon的算法存在纰漏，但出现错误几率较小
                icon = (item.icon.indexOf('fa-') != -1 && item.icon.indexOf('.') == -1) ? '<i class="fa ' + item.icon + ' fa-fw"></i>' : '<img src="' + item.icon + '" />';
            html += '<li class="layui-nav-item ' + isParent + ' ' + extend + '" ' + id + ' ' + url + ' ' + title + ' ' + opentype + ' ' + maxopen + ' ' + winIcon + '>';
            html += '<a><div class="winui-menu-icon">'
            html += icon;
            html += '</div>';
            html += '<span class="winui-menu-name">' + item.name + '</span></a>';
            if (item.childs) {
                html += '<dl class="layui-nav-child">';
                $(item.childs).each(function (cIndex, cItem) {
                    var cId = (cItem.id == '' || cItem.id == undefined) ? '' : 'win-id="' + cItem.id + '"',
                        cUrl = (cItem.pageURL == '' || cItem.pageURL == undefined) ? '' : 'win-url="' + cItem.pageURL + '"',
                        cTitle = (cItem.title == '' || cItem.title == undefined) ? '' : 'win-title="' + cItem.title + '"',
                        cOpentype = (cItem.openType == '' || cItem.openType == undefined) ? '' : 'win-opentype="' + cItem.openType + '"',
                        cMaxopen = (cItem.maxOpen == '' || cItem.maxOpen == undefined) ? '' : 'win-maxopen="' + cItem.maxOpen + '"',
                        cWinIcon = (cItem.icon == '' || cItem.icon == undefined) ? '' : 'win-icon="' + cItem.icon + '"',
                        cicon = (cItem.icon.indexOf('fa-') != -1 && cItem.icon.indexOf('.') == -1) ? '<i class="fa ' + cItem.icon + ' fa-fw"></i>' : '<img src="' + cItem.icon + '" />';;
                    html += '<dd ' + cId + ' ' + cUrl + ' ' + cTitle + ' ' + cOpentype + ' ' + cMaxopen + ' ' + cWinIcon + '>';
                    html += '<a><div class="winui-menu-icon">'
                    html += cicon;
                    html += '</div>';
                    html += '<span class="winui-menu-name">' + cItem.name + '</span></a>';
                });
                html += '</dl>';
            }
            html += '</li>';
        });
        $('.winui-menu').html(html);

        //初始化layui的element（可以从新监听点击事件）
        layui.element.init('nav', 'winuimenu');

        //调用渲染完毕的回调函数
        if (typeof callback === 'function')
            callback.call(this, menuItem);
    }

    //设置数据
    Menu.prototype.setData = function (callback) {
        var obj = this
            , currOptions = obj.options;

        if (!currOptions.url || !currOptions.method)
            return
        $.ajax({
            url: currOptions.url,
            type: currOptions.method,
            data: $.extend({}, currOptions.data),
            dataType: 'json',
            success: function (res) {
                res = res.data;
                if (typeof res === "string") {
                    obj.data = JSON.parse(res);
                    if (typeof callback === 'function')
                        callback.call(obj);
                } else if (typeof (res) == "object" && (Object.prototype.toString.call(res).toLowerCase() == "[object object]" || Object.prototype.toString.call(res).toLowerCase() == "[object array]")) {
                    obj.data = res;
                    if (typeof callback === 'function')
                        callback.call(obj);
                } else {
                    layer.msg('请对接口返回json对象或者json字符串', {
                        offset: '40px',
                        zIndex: layer.zIndex
                    });
                }
            },
            error: function (e) {
                if (e.status != 200) {
                    console.error(e.statusText);
                } else {
                    layer.msg('请对接口返回json对象或者json字符串', {
                        offset: '40px',
                        zIndex: layer.zIndex
                    });
                }
            }
        });
    };

    //开始菜单项构造函数
    var MenuItem = function () {
        this.contextmenuOptions = {};
    };

    //菜单项单击事件
    MenuItem.prototype.onclick = function (callback) {
        element.on('nav(winuimenu)', callback);
    };

    //菜单项右键菜单定义
    MenuItem.prototype.contextmenu = function (options) {
        if (!options.item)
            return;

        //重置右键事件
        common.resetEvent('.winui-menu li:not(.parent),.winui-menu dd', 'mouseup', function (e) {
            if (!e) e = window.event;
            var currentItem = this;
            if (e.button == 2) {
                var left = e.clientX;
                var top = e.clientY;
                //右键点击
                var div = '<ul class="menu-contextmenu" style="top:' + top + 'px;left:' + left + 'px;">';
                $(options.item).each(function (index, item) {
                    var icon = item.icon ? '<i class="fa ' + item.icon + ' fa-fw"></i>' : '';
                    div += '<li>' + icon + item.text + '</li>';
                });
                div += '</ul>';

                //移除之前任务项右键菜单
                $('.menu-contextmenu').remove();
                //渲染当前任务项右键菜单
                $('body').append(div);
                //绑定单击回调函数
                $('ul.menu-contextmenu li').on('click', function () {
                    var index = $(this).index();
                    if (typeof options['item' + (index + 1)] !== 'function')
                        return;
                    //调用回调函数
                    options['item' + (index + 1)].call(this, $(currentItem).attr('win-id'), $(currentItem));

                    $('.menu-contextmenu').remove();
                });
                //阻止右键菜单冒泡
                $('.menu-contextmenu li').on('click mousedown', call.sp);
            }
        });

        this.contextmenuOptions = options;
    };


    var menuItem = new MenuItem();

    //公共事件
    var common = {
        //重置元素事件
        resetEvent: function (selector, eventName, func) {
            if (typeof func != "function") return;
            $(selector).off(eventName).on(eventName, func);
        },
    };

    //基础事件
    var call = {
        //阻止事件冒泡
        sp: function (event) {
            layui.stope(event);
        }
    };

    var menu = new Menu();

    //配置
    menu.config = function (options) {
        options = options || {};
        for (var key in options) {
            this.options[key] = options[key];
        }
        return this;
    };

    //初始化
    menu.init = function (options, callback) {
        if (typeof options === 'object') {
            this.config(options);
        } else if (typeof options == 'fuction') {
            callback = options;
        }
        //缓存回调函数
        this.done = callback = callback || this.done;

        this.setData(function () {
            this.render(callback);
        });
    }

    winui.menu = menu;

    exports('start', {});

    delete layui.start;
});