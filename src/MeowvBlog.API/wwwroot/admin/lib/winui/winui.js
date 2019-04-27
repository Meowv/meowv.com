/*!

 @Title: Winui
 @Description：Win10风格前端模板
 @Site: www.win-ui.com
 @Author: Leo
 @License：MIT

 */

; !function () {
    "use strict";
    var THIS = 'winui-this', SHOW = 'layui-show', MOVE = '.layui-layer-title', MOD_NAME = 'winui', taskbarHeight = 40

        //获取winui路径
        , getPath = function () {
            var doc = document;
            var jsPath = doc.currentScript ? doc.currentScript.src : function () {
                var js = doc.scripts
                    , last = js.length - 1
                    , src;
                for (var i = last; i > 0; i--) {
                    if (js[i].readyState === 'interactive') {
                        src = js[i].src;
                        break;
                    }
                }
                return src || js[last].src;
            }();
            return jsPath.substring(0, jsPath.lastIndexOf('/') + 1);
        }()

        //判断变量是否是Dom对象
        , isDom = (typeof HTMLElement === 'object') ? function (obj) {
            return obj instanceof HTMLElement;
        } : function (obj) {
            return (obj && typeof obj === 'object' && obj.nodeType === 1 && typeof obj.nodeName === 'string');
        }

        //判断变量是否是Jq对象
        , isJquery = function (obj) {
            return obj instanceof $;
        }

    layui.define(['jquery', 'layer', 'element', 'form'], function (exports) {
        var $ = layui.jquery
            , form = layui.form

            //开始磁贴
            , tile = {
                data: null,
                setData: function (options) {
                    common.setData(this, '/json/tile-item.json', options);
                }
            }

            //任务栏
            , taskItem = {
                on: function (eventname, callback) {
                    call.on('taskItem(' + eventname + ')', callback);
                }
            }

            //tab
            , tab = {
                init: function () {
                    //Tab单击事件
                    common.resetClick('.winui-tab-nav li', function () {
                        var othis = $(this),
                            index = index || othis.parent().children('li').index(othis),
                            parents = othis.parents('.winui-tab').eq(0),
                            item = parents.find('.winui-tab-content').children('.winui-tab-item'),
                            filter = parents.attr('lay-filter');
                        common.selectDom(this);
                        common.showDom(item.eq(index));
                        //调用tabchange事件
                        layui.event.call(othis[0], MOD_NAME, 'tabchange(' + filter + ')', { index: index, elem: parents });
                    });
                },
                on: function (events, callback) {
                    return layui.onevent.call(this, MOD_NAME, events, callback);
                }
            };

        //构造函数
        var Winui = function () {
            this.v = '1.0.0';  //版本号
            this.path = getPath;
            this.settings = layui.data('winui').settings || {
                color: 31,
                taskbarMode: 'bottom',
                bgSrc: 'images/bg_01.jpg',
                lockBgSrc: 'images/bg_01.jpg',
                audioSrc: this.path + 'audio/236',
                startSize: 'sm'
            }; //设置
            this.configs = {}; //配置
            this.event = {};    //自定义事件
            this.verify = {
                required: [
                    /[\S]+/
                    , '必填项不能为空'
                ]
                , phone: [
                    /^1\d{10}$/
                    , '请输入正确的手机号'
                ]
                , email: [
                    /^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/
                    , '邮箱格式不正确'
                ]
                , url: [
                    /(^#)|(^http(s*):\/\/[^\s]+\.[^\s]+)/
                    , '链接格式不正确'
                ]
                , number: [
                    /^\d+$/
                    , '只能填写数字'
                ]
                , date: [
                    /^(\d{4})[-\/](\d{1}|0\d{1}|1[0-2])([-\/](\d{1}|0\d{1}|[1-2][0-9]|3[0-1]))*$/
                    , '日期格式不正确'
                ]
                , identity: [
                    /(^\d{15}$)|(^\d{17}(x|X|\d)$)/
                    , '请输入正确的身份证号'
                ]
            };  //表单验证

            this.tile = tile;
            this.taskItem = taskItem;
            this.tab = tab;
        }

        //原型
        Winui.prototype = {
            //配置
            config: function (options) {
                options = options || {};
                var settings = {};
                for (var key in options) {
                    if (key === 'settings') {
                        settings = options[key];
                        continue;
                    }
                    this.configs[key] = options[key];
                }
                for (var key in settings) {
                    this.settings[key] = settings[key];
                }
                return this;
            }

            //初始化
            , init: function (options, callback) {
                var othis = this;
                var configs = othis.configs,
                    settings = othis.settings,
                    options = options || {};
                //背景图渲染
                if (options.renderBg) {
                    othis.renderBg();
                }
                //播放声音
                if (options.audioPlay && !layui.sessionData('winuiSession').audio) {
                    var audio = document.createElement("audio"), format = undefined;
                    audio.onended = function () {
                        audio = null;
                    }
                    if (audio.canPlayType("audio/mp3"))
                        format = '.mp3';
                    else if (audio.canPlayType("audio/ogg"))
                        format = ".wav";
                    if (format) {
                        audio.src = settings.audioSrc + format;
                        audio.play();
                        //播放过后 刷新页面不再播放
                        layui.sessionData('winuiSession', { key: 'audio', value: true });
                    }
                }
                //任务栏模式渲染
                othis.renderTaskbar();
                //开始菜单尺寸设置
                othis.renderStartSize();
                //颜色渲染
                othis.renderColor();
                //配置初始化
                if (othis.desktop && configs['desktop']) {
                    othis.desktop.init(configs.desktop.options, configs.desktop.done);
                }
                if (othis.menu && configs['menu']) {
                    othis.menu.init(configs.menu.options, configs.menu.done);
                }
                //初始化tab
                othis.tab.init();
                //绑定桌面点击事件
                $(document).mousedown(function () {
                    $('.task-contextmenu,.menu-contextmenu,.app-contextmenu').remove();    //移除显示的任务项右键菜单和菜单项右键菜单
                    $('.winui-start').addClass('layui-hide');   //隐藏开始菜单、控制中心
                    $('.winui-console').removeClass('slideInRight').addClass('slideOutRight');
                    $('.winui-taskbar-start,.winui-taskbar-console').removeClass(THIS);    //移除开始菜单按钮、控制中心按钮的选中样式
                    $('.winui-desktop>.winui-desktop-item').removeClass('winui-this');     //移除桌面app选中状态
                });
                //绑定开始div点击事件
                $('.winui-start').mousedown(function () {
                    $('.task-contextmenu,.menu-contextmenu,.app-contextmenu').remove();    //移除显示的任务项右键菜单和菜单项右键菜单
                });
                //绑定Alt键弹出开始菜单
                $(document).on('keyup', function (e) {
                    if (e.keyCode === 18) {
                        $('.winui-taskbar-start').trigger('click');
                    }
                });
                //绑定左下角开始点击事件
                common.resetClick('.winui-taskbar-start', call.startClick);
                //绑定开始菜单左边按钮鼠标悬浮事件
                common.resetMouseover('.winui-start-left>.winui-start-item', call.startLeftBtnMouseover);
                //绑定开始菜单左面按钮鼠标移出事件
                common.resetMouseout('.winui-start-left>.winui-start-item', call.startLeftBtnMouseout);
                //绑定右下角控制中心点击事件
                common.resetClick('.winui-taskbar-console', call.consoleClick);
                //绑定控制中心展开与折叠事件
                common.resetClick('.winui-console .extend-switch', call.consoleExtendClick);
                //绑定右下角显示桌面点击事件
                common.resetClick('.winui-taskbar-desktop', call.desktopClick);
                //任务栏右下角显示时间
                othis.sysTime('.winui-taskbar-time', '<p>!HH:!mm</p><p>!yyyy-!M-!d</p>');
                //自适应
                $(window).on('resize', common.locaApp);
                //初始化完毕回调
                if (typeof callback === 'function')
                    callback.call(othis);
            }

            //重置主题色
            , resetColor: function (color) {
                if (color) {
                    this.settings.color = color;
                    //缓存数据
                    layui.data('winui', { key: 'settings', value: this.settings });
                }
                this.renderColor();
                //重置所有iframe的颜色
                for (var i = 0; i < window.frames.length; i++) {
                    if (window.frames[i].winui) {
                        window.frames[i].winui.settings.color = color;
                        window.frames[i].winui.renderColor();
                    }
                }
            }

            //渲染主题色
            , renderColor: function () {
                if (this.settings.color) {
                    if ($('body').attr('class')) {
                        $('body').attr('class', $('body').attr('class').replace(/\bwinui-color.*?\b/g, '').replace(/(^\s*)|(\s*$)/g, ""));
                    }
                    $('body').addClass('winui-color' + this.settings.color);
                }
            }

            //重置任务栏模式
            , resetTaskbar: function (taskbarMode) {
                if (taskbarMode) {
                    if (this.settings.taskbarMode === taskbarMode)
                        return;
                    this.settings.taskbarMode = taskbarMode;
                    //缓存数据
                    layui.data('winui', { key: 'settings', value: this.settings });
                }
                this.renderTaskbar();
                if (taskbarMode) {
                    this.taskbarChange();
                }
            }

            //渲染任务栏模式
            , renderTaskbar: function () {
                if ($('body').attr('class')) {
                    $('body').attr('class', $('body').attr('class').replace(/\btaskbarIn.*?\b/g, '').replace(/(^\s*)|(\s*$)/g, ""));
                }
                switch (this.settings.taskbarMode) {
                    case 'top':
                        $('body').addClass('taskbarInTop');
                        break;
                    case 'bottom':
                        $('body').addClass('taskbarInBottom');
                        break;
                    case 'left':
                        break;
                    case 'right':
                        break;
                    default:
                        $('body').addClass('taskbarInBottom');
                }
            }

            //重置开始菜单尺寸
            , resetStartSize: function (startSize) {
                if (startSize) {
                    if (this.settings.startSize === startSize)
                        return;
                    this.settings.startSize = startSize;
                    //缓存数据
                    layui.data('winui', { key: 'settings', value: this.settings });

                    $('.preview-start').removeClass('xs sm lg');
                    $('.preview-start').addClass(startSize);
                }
                this.renderStartSize();
            }

            //渲染开始菜单尺寸
            , renderStartSize: function () {
                if ($('.winui-start').attr('class')) {
                    $('.winui-start').attr('class', $('.winui-start').attr('class').replace(/\winui-start-size.*?\b/g, '').replace(/(^\s*)|(\s*$)/g, ""));  //去掉winui-start-size的class后去除两边空格
                }
                switch (this.settings.startSize) {
                    case 'xs':
                        $('.winui-start').addClass('winui-start-size-xs');
                        break;
                    case 'sm':
                        $('.winui-start').addClass('winui-start-size-sm');
                        break;
                    default:
                }
            }

            //重置背景图
            , resetBg: function (bgSrc) {
                if (bgSrc) {
                    this.settings.bgSrc = bgSrc;
                    //缓存数据
                    layui.data('winui', { key: 'settings', value: this.settings });
                }
                this.renderBg();
            }

            //渲染背景图
            , renderBg: function () {
                var bgSrc = this.settings.bgSrc;
                if (bgSrc)
                    $('body').css('background-image', 'url(' + bgSrc + ')');
            }

            //重置锁屏图
            , resetLockBg: function (bgSrc) {
                if (bgSrc) {
                    this.settings.lockBgSrc = bgSrc;
                    //缓存数据
                    layui.data('winui', { key: 'settings', value: this.settings });
                }
            }

            //全屏
            , fullScreen: function (element) {
                // 判断各种浏览器，找到正确的方法
                var requestMethod = element.requestFullScreen || //W3C
                    element.webkitRequestFullScreen || //Chrome等
                    element.mozRequestFullScreen || //FireFox
                    element.msRequestFullScreen; //IE11
                if (requestMethod) {
                    requestMethod.call(element);
                }
                else if (typeof window.ActiveXObject !== "undefined") {//for Internet Explorer
                    var wscript = new ActiveXObject("WScript.Shell");
                    if (wscript !== null) {
                        wscript.SendKeys("{F11}");
                    }
                }
            }

            //退出全屏
            , exitFullScreen: function () {
                // 判断各种浏览器，找到正确的方法
                var exitMethod = document.exitFullscreen || //W3C
                    document.mozCancelFullScreen ||    //Chrome等
                    document.webkitExitFullscreen || //FireFox
                    document.webkitExitFullscreen; //IE11
                if (exitMethod) {
                    exitMethod.call(document);
                }
                else if (typeof window.ActiveXObject !== "undefined") {//for Internet Explorer
                    var wscript = new ActiveXObject("WScript.Shell");
                    if (wscript !== null) {
                        wscript.SendKeys("{F11}");
                    }
                }
            }

            //隐藏开始菜单
            , hideStartMenu: function () {
                $('.winui-start').addClass('layui-hide');
            }

            //返回GUID
            , guid: function () {
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            }

            //验证表单
            , verifyForm: function (button) {
                var button = $(button),
                    stop = null,
                    device = layui.device(),
                    DANGER = 'layui-form-danger',
                    elem = button.parents('.layui-form'),
                    verifyElem = elem.find('*[win-verify]'),//获取需要校验的元素
                    that = this,
                    windowfunc = this.window;
                layui.each(verifyElem, function (index, item) {
                    var othis = $(this), ver = othis.attr('win-verify').split('|');
                    var tips = '', value = othis.val();
                    othis.removeClass(DANGER);
                    layui.each(ver, function (_, thisVer) {
                        var isFn = typeof that.verify[thisVer] === 'function';
                        if (that.verify[thisVer] && (isFn ? tips = that.verify[thisVer](value, item) : !that.verify[thisVer][0].test(value))) {
                            windowfunc.msg(tips || that.verify[thisVer][1], {
                                icon: 5
                                , shift: 6
                            });
                            //非移动设备自动定位焦点
                            if (!device.android && !device.ios) {
                                item.focus();
                            }
                            othis.addClass(DANGER);
                            return stop = true;
                        }
                    });
                    if (stop) return stop;
                });
                return !stop;
            }

            //显示系统时间
            , sysTime: function (selector, formatStr) {
                return setInterval(function () {
                    //获取系统时间。
                    var dateTime = new Date();

                    var str = formatStr;
                    var Week = ['日', '一', '二', '三', '四', '五', '六'];

                    if (str != undefined) {
                        str = str.replace(/!yyyy|!YYYY/, dateTime.getFullYear());
                        str = str.replace(/!yy|!YY/, (dateTime.getYear() % 100) > 9 ? (dateTime.getYear() % 100).toString() : '0' + (dateTime.getYear() % 100));
                        str = str.replace(/!MM/, (dateTime.getMonth() + 1) > 9 ? (dateTime.getMonth() + 1).toString() : '0' + (dateTime.getMonth() + 1));
                        str = str.replace(/!M/g, (dateTime.getMonth() + 1));

                        str = str.replace(/!w|!W/g, Week[dateTime.getDay()]);

                        str = str.replace(/!dd|!DD/, dateTime.getDate() > 9 ? dateTime.getDate().toString() : '0' + dateTime.getDate());
                        str = str.replace(/!d|!D/g, dateTime.getDate());

                        str = str.replace(/!hh|!HH/, dateTime.getHours() > 9 ? dateTime.getHours().toString() : '0' + dateTime.getHours());
                        str = str.replace(/!h|!H/g, dateTime.getHours());
                        str = str.replace(/!mm/, dateTime.getMinutes() > 9 ? dateTime.getMinutes().toString() : '0' + dateTime.getMinutes());
                        str = str.replace(/!m/g, dateTime.getMinutes());

                        str = str.replace(/!ss|!SS/, dateTime.getSeconds() > 9 ? dateTime.getSeconds().toString() : '0' + dateTime.getSeconds());
                        str = str.replace(/!s|!S/g, dateTime.getSeconds());
                    } else {
                        var year = dateTime.getFullYear();
                        var month = dateTime.getMonth() + 1;
                        var day = dateTime.getDate();
                        var hh = dateTime.getHours();
                        var mm = dateTime.getMinutes();
                        var ss = dateTime.getSeconds();

                        //分秒时间是一位数字，在数字前补0。
                        mm = mm < 10 ? ("0" + mm) : mm;
                        ss = ss < 10 ? ("0" + ss) : ss;
                        str = year + '-' + month + '-' + day + ' ' + hh + ':' + mm + ':' + ss;
                    }

                    //将时间显示到指定的位置，时间格式形如：19:18:02
                    $(selector).html(str);
                }, 1000);
            }

            //停止显示时间
            , stopSysTime: function (obj) {
                window.clearInterval(obj);
            }

            //任务栏自适应
            , taskAuto: function () {
                var res = true;
                $('.winui-taskbar-task').each(function () {
                    var thisWidth = parseInt($(this).prop('scrollWidth'));
                    var childWidth = parseInt($(this).children().length * 165);
                    //响应式
                    if (thisWidth - 165 < childWidth) {
                        layer.msg('任务栏装不下啦', { zIndex: layer.zIndex });
                        res = false;
                        return false;
                    }
                });
                return res;
            }

            //任务栏改变
            , taskbarChange: function () {
                //根据任务栏模式调整位置
                switch (this.settings.taskbarMode) {
                    case 'top':
                        $('.winui-window').css('top', function (index, current) {
                            $(this).css('top', (Number(current.replace('px', '')) + taskbarHeight) + 'px');
                        });
                        break;
                    case 'bottom':
                        $('.winui-window').css('top', function (index, current) {
                            $(this).css('top', (Number(current.replace('px', '')) - taskbarHeight) + 'px');
                        });
                        break;
                    case 'left':
                        break;
                    case 'right':
                        break;
                    default:
                }
            }

            //获取Winui设置
            , getSetting: function (settingKey) {
                return this.settings[settingKey];
            }

            //锁屏
            , lockScreen: function (callback) {
                var self = this;
                $('.winui-taskbar').css('zIndex', '0');
                $.get(winui.path + 'html/system/lockscreen.html', {}, function (content) {
                    layer.open({
                        id: 'winui-lockscreen',
                        type: 1,
                        title: false,
                        skin: 'lockscreen',
                        closeBtn: 0,
                        shade: 0,
                        anim: -1,
                        isOutAnim: false,
                        zIndex: layer.zIndex,
                        content: content,
                        success: function (layero, layerindex) {
                            $('.lock-body').css('background-image', 'url(' + self.settings.lockBgSrc + ')');
                            window.localStorage.setItem("lockscreen", true);
                            var index = winui.sysTime('#date_time', '<p id="time">!HH:!mm</p><p id="date">!M月!d日,星期!w</p>');
                            var showUnlockDiv = function () {
                                winui.stopSysTime(index);
                                $('#date_time').toggleClass('layui-hide');
                                $('#login_div').toggleClass('layui-hide');
                                //解绑旧的鼠标键盘事件
                                $(document).off('mouseup', docMouseup);
                                $(document).off(' keydown', docKeydown);
                                //绑定新的键盘事件
                                $(document).on('keydown', function (e) {
                                    var ev = document.all ? window.event : e;
                                    if (ev.keyCode == 27) {
                                        //按下ESC
                                        showTimeDiv();
                                    }
                                });
                            }, showTimeDiv = function () {
                                index = winui.sysTime('#date_time', '<p id="time">!HH:!mm</p><p id="date">!M月!d日,星期!w</p>')
                                $('#date_time').toggleClass('layui-hide');
                                $('#login_div').toggleClass('layui-hide');
                                //解绑旧的鼠标键盘事件
                                $(document).off('keydown');
                                //绑定新事件
                                $(document).on('mouseup', docMouseup);
                                $(document).on('keydown', docKeydown);
                            }, docMouseup = function (e) {
                                if (!e) e = window.event;
                                if (e.button == 0) {
                                    //左键
                                    showUnlockDiv();
                                }
                            }, docKeydown = function (e) {
                                var ev = document.all ? window.event : e;
                                if (ev.keyCode == 13) {
                                    //按下回车
                                    showUnlockDiv();
                                }
                            }
                            $(document).on('mouseup', docMouseup);
                            $(document).on('keydown', docKeydown);
                            //解锁点击
                            form.on('submit(unlock)', function (data) {
                                try {
                                    if (typeof callback === 'function' && callback.call(this, data.field.password)) {
                                        layer.close(layerindex);
                                        window.localStorage.setItem("lockscreen", false);
                                    }
                                } catch (e) {
                                    console.error(e);
                                    return false;
                                }
                                return false;
                            });
                        }
                    });
                });
            }
        };

        //公共事件
        var common = {

            //获取WindowId（传入WindowDom）
            getWindowIdByWindow: function (window) {
                return $(window).find('.layui-layer-content').prop('id');
            }

            //获取任务项（传入WindowDom）
            , getTaskItemByWindowDom: function (WindowDom) {
                var windowId = common.getWindowIdByWindow(WindowDom);
                return common.getTaskItem(windowId);
            }

            //获取任务项的Dom对象（传入id或者任务项的dom对象或者任务项的jq对象）
            , getTaskItem: function (param) {
                return typeof param == 'string' ? $('.winui-task-item[win-id=' + param + ']')[0] : (isDom(param) ? param : (isJquery(param) ? param[0] : null));
            }

            //获取窗口的Dom对象（传入id或者窗口的dom对象或者窗口的jq对象）
            , getWindow: function (param) {
                return typeof param == 'string' ? $('.winui-window:has(.layui-layer-content[id=' + param + '])')[0] : (isDom(param) ? param : (isJquery(param) ? param[0] : null));
            }

            //为dom添加winui-this类
            , selectDom: function (selector) {
                $(selector).addClass(THIS).siblings().removeClass(THIS);
            }

            //为dom添加layui-show类
            , showDom: function (selector) {
                $(selector).addClass(SHOW).siblings().removeClass(SHOW);
            }

            //添加任务项（返回添加的任务项dom）
            , addTaskItem: function (id, title) {
                var taskItem = $('<li win-id="' + id + '" class="winui-task-item">' + title + '</li>');
                $('.winui-taskbar-task').append(taskItem);
                return taskItem;
            }

            //重置元素的Click事件
            , resetClick: function (selector, func) {
                if (typeof func != "function") return;
                $(selector).off('click').on('click', func);
            }

            //重置元素的MouseUp事件
            , resetMouseUp: function (selector, func) {
                if (typeof func != "function") return;
                $(selector).off('mouseup').on('mouseup', func);
            }

            //重置元素Mouseover事件
            , resetMouseover: function (selector, func) {
                if (typeof func != "function") return;
                $(selector).off('mouseover').on('mouseover', func);
            }

            //重置元素Mouseout
            , resetMouseout: function (selector, func) {
                if (typeof func != "function") return;
                $(selector).off('mouseout').on('mouseout', func);
            }

            //移除layui-hide类样式
            , showWindow: function (param) {
                $(common.getWindow(param)).removeClass('layui-hide');
            }

            //添加layui-hide类样式
            , hideWindow: function (param) {
                $(common.getWindow(param)).addClass('layui-hide');
            }

            //获得可见的最顶层Window对象
            , getTopWindow: function () {
                var nextWindow;
                var initIndex = 0;
                $('.winui-window:visible').each(function () {
                    var zIndex = $(this).css('z-index');
                    if (zIndex > initIndex) {
                        nextWindow = this;
                    }
                });
                return nextWindow;
            }

            //判断是否是顶层Window对象
            , isTopWindow: function (window) {
                if (!$(window).is(':visible')) return false;
                var currIndex = $(window).css('z-index');
                var returnVal = true;
                $('.winui-window:visible').each(function () {
                    var zIndex = $(this).css('z-index');
                    if (zIndex > currIndex) {
                        returnVal = false;
                        return returnVal;
                    }
                });
                return returnVal;
            }

            //定位桌面应用
            , locaApp: function () {
                //计算一竖排能容纳几个应用
                var appHeight = 96;
                var appWidth = 90;
                var maxCount = parseInt($('.winui-desktop').height() / 93);
                var oldTemp = 0;
                var rowspan = 0;
                var colspan = 0;
                //定位桌面应用
                $('.winui-desktop>.winui-desktop-item').each(function (index, elem) {
                    var newTemp = parseInt(index / maxCount);

                    colspan = parseInt(index / maxCount);
                    rowspan = oldTemp == newTemp ? rowspan : 0;

                    if (rowspan == 0 && oldTemp != newTemp) oldTemp++;

                    $(this).css('top', appHeight * rowspan + 'px').css('left', appWidth * colspan + 'px');
                    rowspan++;
                });
            }

            //配置数据
            , setData: function (obj, callback) {
                var currOptions = obj.options;
                if (!currOptions.url || !currOptions.method)
                    return
                $.ajax({
                    url: currOptions.url,
                    type: currOptions.method,
                    success: function (res) {
                        res = res.data;
                        if (typeof res === "string") {
                            obj.data = JSON.parse(res);
                            if (typeof callback === 'function')
                                callback.call(this);
                        } else if (typeof (res) == "object" && (Object.prototype.toString.call(res).toLowerCase() == "[object object]" || Object.prototype.toString.call(res).toLowerCase() == "[object array]")) {
                            obj.data = res;
                            if (typeof callback === 'function')
                                callback.call(this);
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
            }
        };

        //基础事件
        var call = {
            //全局事件绑定
            on: function (eventname, callback) {
                if (typeof callback !== "function") return;
                winui.event[eventname] = callback;
            },
            //阻止事件冒泡
            sp: function (event) {
                layui.stope(event);
            },
            //开始菜单点击事件
            startClick: function () {
                $('.task-contextmenu,.menu-contextmenu,.app-contextmenu').remove();    //移除显示的任务项右键菜单和菜单项右键菜单
                $(this).toggleClass(THIS);
                $('.winui-start').toggleClass('layui-hide');
            },
            //显示桌面点击事件
            desktopClick: function () {
                //隐藏所有窗体
                $('.winui-window').addClass('layui-hide');
                //去除所有任务项选中
                $('.winui-task-item').removeClass(THIS);
            },
            //控制中心点击事件
            consoleClick: function () {
                $(this).toggleClass(THIS);
                $('.winui-console').removeClass('layui-hide');
                $('.winui-console').toggleClass('slideInRight');
                $('.winui-console').toggleClass('slideOutRight');
            },
            //控制中心展开与折叠事件
            consoleExtendClick: function () {
                if ($(this).text() === '展开') {
                    $(this).text('折叠');
                    $(this).parents('.winui-shortcut').addClass('extend');
                    $(this).parents('.winui-shortcut').siblings('.winui-message').css('bottom', '330px');
                } else {
                    $(this).text('展开');
                    $(this).parents('.winui-shortcut').removeClass('extend');
                    $(this).parents('.winui-shortcut').siblings('.winui-message').css('bottom', '');
                }
            },
            //开始菜单左边按钮鼠标悬浮事件
            startLeftBtnMouseover: function (event) {
                var text = $(event.currentTarget).attr('data-text');
                var x = event.clientX - 20;
                var y = event.clientY - 50;

                if (x < 0) x = 0;

                var html = '<div class="leftbtnhovertext" style="top:' + y + 'px;left:' + x + 'px;">' + text + '<div>';
                $('body').append(html);
            },
            //开始菜单左边按钮鼠标离开事件
            startLeftBtnMouseout: function () {
                $('.leftbtnhovertext').remove();
            }
        };

        //阻止原有的右键菜单
        $(document).off('contextmenu').on('contextmenu', function () {
            return false;
        });

        //阻止冒泡
        $('.sp').off('click mousedown').on('click mousedown', call.sp);


        window.winui = new Winui();

        winui.tab.init();

        exports('winui', {});

        delete layui.winui;
    });
}(window);



