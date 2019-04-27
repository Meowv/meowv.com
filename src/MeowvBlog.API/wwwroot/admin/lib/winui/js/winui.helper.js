/**

 @Name：winui.helper 桌面助手模块
 @Author：Leo
 @License：MIT
    
 */

layui.define(['jquery', 'layer', 'winui'], function (exports) {
    "use strict";

    var $ = layui.jquery
        //常量字符串
        , SETWIN = '.winui-helper-setwin', LOCK = '.winui-helper-lock', MENU = '.winui-helper-menu', SWITCH = ".winui-helper-switch", CONTENT = '.winui-helper-content', TOOL = '.winui-helper-tool'
        //16进制颜色校验表达式
        , reg = /^#([0-9a-fA-f]{3}|[0-9a-fA-f]{6})$/
        //16进制颜色转RGB
        , hexToRGB = function (hex) {
            var sColor = hex.toLowerCase();
            if (sColor && reg.test(sColor)) {
                if (sColor.length === 4) {
                    var sColorNew = "#";
                    for (var i = 1; i < 4; i += 1) {
                        sColorNew += sColor.slice(i, i + 1).concat(sColor.slice(i, i + 1));
                    }
                    sColor = sColorNew;
                }
                //处理六位的颜色值  
                var sColorChange = [];
                for (var i = 1; i < 7; i += 2) {
                    sColorChange.push(parseInt("0x" + sColor.slice(i, i + 2)));
                }
                return "RGB(" + sColorChange.join(",") + ")";
            } else {
                return sColor;
            }
        }
        //16进制转RGBA
        , hexToRGBA = function (hex, alp) {
            //注：rgb_color的格式为#FFFFFFF，alp为透明度  
            var r = parseInt("0x" + hex.substr(1, 2));
            var g = parseInt("0x" + hex.substr(3, 2));
            var b = parseInt("0x" + hex.substr(5, 2));
            var a = alp;
            return "rgba(" + r + "," + g + "," + b + "," + a + ")";
        }
        //制作工具栏HTML字符
        , addTool = function (tips, icon, style) {
            return '<span class="tool-tags" data-tips="' + tips + '"><i ' + (style ? 'style = "' + style + '"' : '') + ' class="fa fa-fw ' + icon + '"></i></span>';
        }
        //桌面助手的HTML字符
        , helperContent = '<div class="winui-helper-content"><hr/><div class="winui-helper-tool"></div></div>'
        //获取桌面助手右上角的HTML
        , getSetwin = function (lock, up) {
            return '<span class="winui-helper-setwin"><a title="解锁" class="winui-helper-lock"><i class="fa fa-fw ' + (lock ? 'fa-lock' : 'fa-unlock-alt') + '"></i></a><a title="菜单" class="winui-helper-menu"><i class="fa fa-fw fa-bars"></i></a><a title="收起" class="winui-helper-switch"><i class="fa fa-fw ' + (up ? 'fa-chevron-up' : 'fa-chevron-down') + '"></i></a></span>';
        }
        , toggleHide = function () {
            $('.winui-desktop-item').toggle();
        }

        //构造函数
        , Class = function (options) {
            var that = this;
            //缓存默认配置
            that.cache = that.config;
            //读取本地配置
            that.config = layui.data('winui-helper').configs || that.config;
            that.config = $.extend({}, that.config, options);
            that.render();
        };

    //默认配置
    Class.prototype.config = {
        bgColor: '#010101',
        opacity: 0.3,
        dblclickHide: false
    };

    //助手渲染
    Class.prototype.render = function (options, callback) {
        options = options || (layui.data('winui-helper').options || { move: true, lock: false, up: false });
        if (options.move === true)
            options.move = '.layui-layer-title';
        var that = this;
        layui.link(winui.path + 'css/helper.css', 'helper');
        var configs = {
            id: 'helper',
            type: 1,
            title: '桌面助手',
            skin: 'layer-ext-winhelper',
            shade: 0,
            closeBtn: 0,
            anim: -1,
            content: helperContent,
            zIndex: layer.zIndex,
            offset: options.offset || ['12vh', '72vw'],
            success: function (layero, index) {
                $(layero).css({ 'background-color': hexToRGBA(that.config.bgColor, that.config.opacity) });
                //渲染右上角
                $(layero).append(getSetwin(options.lock, options.up));
                if (options.up) {
                    $(CONTENT).show();
                } else {
                    $(CONTENT).hide();
                }
                //渲染工具栏
                that.addTool([{
                    tips: '添加便签',
                    icon: 'fa-pencil-square-o',
                    click: function (e) {
                        var tagsCount = $(CONTENT).children('.tags-content').length;
                        if (tagsCount >= 5) {
                            layer.msg('最多只能存五条便签', { zIndex: layer.zIndex });
                            return;
                        }
                        $(CONTENT).append('<hr /><div class="tags-content"><textarea placeholder="输入内容，如：桌面助手真牛逼"></textarea></div>');
                        var $currTextarea = $(CONTENT).children('.tags-content').eq(tagsCount).children('textarea');
                        $currTextarea.focus();
                        $currTextarea.on('blur', function () {
                            var content = $(this).val();
                            if ($.trim(content) === '') {
                                $(this).parent().prev('hr').remove();
                                $(this).parent().remove();
                                var tags = layui.data('winui-helper').tags || [];
                                tags.splice(tagsCount, 1);
                                layui.data('winui-helper', {
                                    key: 'tags',
                                    value: tags
                                });
                                return;
                            }
                            var tags = layui.data('winui-helper').tags || [];
                            tags.push(content);
                            layui.data('winui-helper', {
                                key: 'tags',
                                value: tags
                            });
                        });
                    }
                }, {
                    tips: '主题设置',
                    icon: 'fa-paw',
                    click: function (e) {
                        winui.window.openTheme();
                    }
                }]);
                //渲染扩展工具栏

                //读取本地便签
                var tags = layui.data('winui-helper').tags;
                if (tags instanceof Array)
                    $.each(tags, function (index, item) {
                        if (index >= 5)
                            return;
                        $(CONTENT).append('<hr /><div class="tags-content"><textarea placeholder="输入内容，便签存于本地">' + item + '</textarea></div>');
                        $(CONTENT).children('.tags-content').eq(index).children('textarea').on('blur', function () {
                            var content = $(this).val();
                            var tags = layui.data('winui-helper').tags || [];
                            if ($.trim(content) === '') {
                                $(this).parent().prev('hr').remove();
                                $(this).parent().remove();
                                tags.splice(index, 1);
                                layui.data('winui-helper', {
                                    key: 'tags',
                                    value: tags
                                });
                                return;
                            }
                            tags[index] = content;
                            layui.data('winui-helper', {
                                key: 'tags',
                                value: tags
                            });
                        });
                    });
                //锁定与解锁点击
                $(LOCK).on('click', function (e) {
                    var top = $(layero).css('top');
                    var left = $(layero).css('left');
                    var thisOptions = { offset: [top, left], up: options.up };
                    if (options.move) {
                        //当前为解锁状态
                        $(layero).remove();
                        $.extend(thisOptions, { move: false, lock: true });
                    } else {
                        //当前为锁定状态
                        $(layero).remove();
                        $.extend(thisOptions, { move: true, lock: false });
                    }
                    that.render(thisOptions, function () {
                        var extTool = layui.data('winui-helper').extTool;
                        extTool && that.addTool(extTool);
                    });
                });
                //助手菜单点击
                $(MENU).on('click', function (e) {
                    layui.stope(e);
                    var left = e.clientX,
                        top = e.clientY,
                        html = '<ul class="helper-menu" style="top:' + top + 'px;left:' + left + 'px;"><li><i class="fa fa-fw fa-cog"></i>设置</li><li><i class="fa fa-fw fa-outdent"></i>退出桌面助手</li></ul>';
                    //移除之前菜单
                    $('.helper-menu').remove();
                    //渲染当前菜单
                    $('body').append(html);
                    //设置点击
                    $('.helper-menu li').eq(0).on('mousedown', function (e) {
                        layui.stope(e);
                        if (e.button == 0) {
                            $.get(winui.path + 'html/helper/settings.html', {}, function (res) {
                                layer.open({
                                    id: 'helpersettings',
                                    title: '桌面助手设置中心',
                                    type: 1,
                                    area: ['560px', '400px'],
                                    skin: 'layer-ext-hprsettings',
                                    content: res,
                                    shade: 0,
                                    zIndex: layer.zIndex,
                                    success: function (layero, index) {
                                        layer.setTop(layero);
                                        var $title = $(layero).find('.layui-layer-title');
                                        $title.css('cursor', 'default');
                                        $title.on('mousedown', function () {
                                            $('.layui-layer-move').css('cursor', 'default');
                                        });
                                        $(layero).find('.layui-layer-close').removeAttr('href');
                                    }
                                });
                            });
                        }
                    });
                    //退出点击
                    $('.helper-menu li').eq(1).on('mousedown', function (e) {
                        layui.stope(e);
                        if (e.button == 0) {
                            that.destroy();
                        }
                    });
                });
                //收缩与展开点击
                $(SWITCH).on('click', function (e) {
                    $(CONTENT).slideToggle('fast');
                    $(SWITCH).find('.fa').toggleClass('fa-chevron-up').toggleClass('fa-chevron-down');
                    options.up = !options.up;
                    //本地缓存
                    layui.data('winui-helper', {
                        key: 'options',
                        value: options
                    });
                });

                if (typeof callback === 'function') {
                    callback.call(layero);
                }
            }
        };
        //本地缓存
        layui.data('winui-helper', {
            key: 'options',
            value: options
        });
        $.extend(configs, options);
        that.index = layer.open(configs);
    };

    //添加工具栏
    Class.prototype.addTool = function (options) {
        if (!options)
            return;
        if (!options instanceof Array)
            options = [options];
        var count = $(TOOL).children('span').length;    //已有数量
        $.each(options, function (index, item) {
            //拼接HTML
            $(TOOL).append('<span data-tips="' + item.tips + '"><i ' + (item.style ? 'style = "' + item.style + '"' : '') + ' class="fa fa-fw ' + item.icon + '"></i></span>');
            //绑定事件
            if (typeof item.click === 'function') {
                $(TOOL).children('span').eq(count + index).on('click', item.click);
            }
        });

        //工具栏悬浮
        var tipIndex;
        $('.winui-helper-tool>span').off('mouseover').off('mouseout').on('mouseover', function (e) {
            tipIndex = layer.tips($(this).data('tips'), this, {
                zIndex: layer.zIndex,
                tips: [3, '#f5f5f5'],
                skin: 'winui-helper-tips',
                time: 0,
                anim: 5,
                success: function (layero) {
                    var top = Number($(layero).css('top').replace('px', '')) + 5 + 'px',
                        left = Number($(layero).css('left').replace('px', '')) - 10 + 'px';
                    $(layero).css({ 'top': top, 'left': left })
                }
            });
        }).on('mouseout', function (e) {
            layer.close(tipIndex);
        });
    }

    //销毁桌面助手
    Class.prototype.destroy = function () {
        $('.layer-ext-winhelper,.helper-menu').remove();
    }

    //背景设置
    Class.prototype.bgset = function (options) {
        var that = this;
        if (!that.index)
            return;
        options = options || {};
        for (var key in options) {
            that.config[key] = options[key];
        }
        layer.style(that.index, { 'background-color': hexToRGBA(that.config.bgColor, that.config.opacity) });
        //本地缓存
        layui.data('winui-helper', {
            key: 'configs',
            value: that.config
        });
    }

    //是否开启双击隐藏桌面图标
    Class.prototype.dblHideSet = function (res) {
        var that = this;
        if (res !== undefined) {
            that.config.dblclickHide = res;
            //本地缓存
            layui.data('winui-helper', {
                key: 'configs',
                value: that.config
            });
        }
        if (that.config.dblclickHide === true) {
            $('.winui-desktop').on('dblclick', toggleHide);
        } else {
            $('.winui-desktop').off('dblclick', toggleHide);
            $('.winui-desktop-item').show();
        }
    }

    var helper = {

    };

    helper.creat = function (options) {
        var othis = this
            , that = new Class(options)
            , async = function () {
                othis.bgColor = that.config.bgColor;
                othis.opacity = that.config.opacity;
                othis.dblhide = that.config.dblclickHide;
            };

        this.bgset = function (options) {
            that.bgset(options);
            async();
        };

        this.bgReset = function () {
            othis.bgset({
                bgColor: that.cache.bgColor
                , opacity: that.cache.opacity
            });
        }

        this.toggleHide = function (res) {
            that.dblHideSet(res);
            async();
        }

        this.addTool = function (options) {
            //本地缓存
            layui.data('winui-helper', {
                key: 'extTool',
                value: options
            });
            that.addTool(options);
        }

        that.dblHideSet();
        async();
    }

    //自动创建
    helper.creat();

    winui.helper = helper;

    exports('helper', {});

    $(document).on('mousedown click', function () {
        $('.helper-menu').remove();
    });
    $(window).resize(function () {
        $('.helper-menu').remove();
    });

    delete layui.helper;
});