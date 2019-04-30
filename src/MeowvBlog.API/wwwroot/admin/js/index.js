layui.config({
    base: '/admin/lib/winui/'
    , version: '1.0.0'
}).extend({
    window: 'js/winui.window',
    desktop: 'js/winui.desktop',
    start: 'js/winui.start'
}).define(['window', 'desktop', 'start'], function (exports) {
    var $ = layui.jquery;

    $(function () {
        winui.config({
            settings: layui.data('winui').settings || {
                color: 32,
                taskbarMode: 'bottom',
                startSize: 'sm',
                bgSrc: '/admin/images/bg_01.jpg',
                lockBgSrc: '/admin/images/bg.jpg'
            },  //如果本地配置为空则给默认值
            desktop: {
                options: {},    //可以为{}  默认 请求 json/desktopmenu.json
                done: function (desktopApp) {
                    desktopApp.ondblclick(function (id, elem) {
                        OpenWindow(elem);
                    });
                    desktopApp.contextmenu({
                        //item: ["打开", "删除", '右键菜单可自定义'],
                        //item1: function (id, elem) {
                        //    OpenWindow(elem);
                        //},
                        //item2: function (id, elem, events) {
                        //    winui.window.msg('删除回调');
                        //    $(elem).remove();
                        //    //从新排列桌面app
                        //    events.reLocaApp();
                        //},
                        //item3: function (id, elem, events) {
                        //    winui.window.msg('自定义回调');
                        //}
                    });
                }
            },
            menu: {
                options: {
                    url: '/admin/json/allmenu.json',
                    method: 'get',
                    data: {}
                },
                done: function (menuItem) {
                    //监听开始菜单点击
                    menuItem.onclick(function (elem) {
                        OpenWindow(elem);
                    });
                    menuItem.contextmenu({
                        //item: [{
                        //    icon: 'fa-cog'
                        //    , text: '设置'
                        //}, {
                        //    icon: 'fa-close'
                        //    , text: '关闭'
                        //}, {
                        //    icon: 'fa-qq'
                        //    , text: '右键菜单可自定义'
                        //}],
                        //item1: function (id, elem) {
                        //    //设置回调
                        //    console.log(id);
                        //    console.log(elem);
                        //},
                        //item2: function (id, elem) {
                        //    //关闭回调
                        //},
                        //item3: function (id, elem) {
                        //    winui.window.msg('自定义回调');
                        //}
                    });
                }
            }
        }).init({
            renderBg: true //是否渲染背景图 （由于js是写在页面底部，所以不太推荐使用这个来渲染，背景图应写在css或者页面头部的时候就开始加载）
        }, function () {
            //初始化完毕回调
        });
    });

    //开始菜单磁贴点击
    $('.winui-tile').on('click', function () {
        OpenWindow(this);
    });

    //开始菜单左侧主题按钮点击
    $('.winui-start-item.winui-start-individuation').on('click', function () {
        winui.window.openTheme();
    });

    //打开窗口的方法（可自己根据需求来写）
    function OpenWindow(menuItem) {
        var $this = $(menuItem);

        var url = $this.attr('win-url');
        var title = $this.attr('win-title');
        var id = $this.attr('win-id');
        var type = parseInt($this.attr('win-opentype'));
        var maxOpen = parseInt($this.attr('win-maxopen')) || -1;
        if (url == 'theme') {
            winui.window.openTheme();
            return;
        }
        if (!url || !title || !id) {
            winui.window.msg('菜单配置错误（菜单链接、标题、id缺一不可）');
            return;
        }

        var content = url;

        //核心方法（参数请看文档，config是全局配置 open是本次窗口配置 open优先级大于config）
        winui.window.config({
            anim: 0,
            miniAnim: 0,
            maxOpen: -1
        }).open({
            id: id,
            type: type,
            title: title,
            content: content
            , maxOpen: maxOpen
            , refresh: true
            //,area: ['70vw','80vh']
            //,offset: ['10vh', '15vw']
            //, max: false
            //, min: false
        });
    }

    //注销登录
    $('.logout').on('click', function () {
        winui.hideStartMenu();
        winui.window.confirm('确认注销吗?', { icon: 3, title: '提示' }, function (index) {
            window.location.href = "/azuread/account/signout";

            layer.close(index);
        });
    });

    //锁屏
    $('.lockScreen').on('click', function () {
        winui.hideStartMenu();
        winui.lockScreen(function (password) {
            if (password === 'qix') {
                return true;
            } else {
                winui.window.msg('密码错误', { shift: 6 });
                return false;
            }
        });
    });

    //全屏
    $('.fullscreen').on('click', function () {
        winui.hideStartMenu();
        winui.fullScreen(document.documentElement);
    });

    // 判断是否显示锁屏（这个要放在最后执行）
    if (window.localStorage.getItem("lockscreen") == "true") {
        winui.lockScreen(function (password) {
            //模拟解锁验证
            if (password === 'qix') {
                return true;
            } else {
                winui.window.msg('密码错误', { shift: 6 });
                return false;
            }
        });
    }

    exports('index', {});
});