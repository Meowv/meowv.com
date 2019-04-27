/**

 @Name：主题设置
 @Author：Leo
 @License：MIT
    
 */
layui.use(['layer', 'form'], function (exports) {
    var $ = layui.jquery, form = layui.form, unfinished = '暂未实现';

    $(function () {
        winui.renderColor();
        winui.tab.init();
        //设置预览背景为当前背景
        $('.background-preview').css('background-image', layui.jquery('body').css('background-image'));
        //设置锁屏预览背景为当前锁屏预览背景
        $('.lockscreen-preview').css('background-image', 'url(' + winui.getSetting('lockBgSrc') + ')');

        //设置主题预览中任务栏位置
        var taskbarMode = winui.getSetting('taskbarMode');
        $('.taskbar-position input[value=' + taskbarMode + ']').prop('checked', true);
        //设置主题预览中开始菜单尺寸
        var startSize = winui.getSetting('startSize');
        $('.start-size input[value=' + startSize + ']').prop('checked', true);
        $('.preview-start').removeClass('xs sm lg');
        $('.preview-start').addClass(startSize);

        form.render();

        //预览锁屏界面
        var Week = ['日', '一', '二', '三', '四', '五', '六'];
        var dateTime = new Date();
        $('.lockscreen-preview-time').html('<p id="time">' + (dateTime.getHours() > 9 ? dateTime.getHours().toString() : '0' + dateTime.getHours()) + ':' + (dateTime.getMinutes() > 9 ? dateTime.getMinutes().toString() : '0' + dateTime.getMinutes()) + '</p><p id="date">' + (dateTime.getMonth() + 1) + '月' + dateTime.getDate() + '日,星期' + Week[dateTime.getDay()] + '</p>');
    });
    //背景图片点击
    $('.background-choose>img').on('click', function () {
        //获取当前图片路径
        var bgSrc = $(this).prop('src');
        //改变预览背景
        $('.background-preview').css('background-image', 'url(' + bgSrc + ')');
        //改变父页面背景
        winui.resetBg(bgSrc);
    })
    //背景图片上传
    $('.background-upload').on('click', function () {
        var input = $(this).prev('input[type=file]');
        input.trigger('click');
        input.on('change', function () {
            var src = $(this).val();
            if (src) {
                layer.msg('选择了路径【' + src + '】下的图片，返回一张性感的Girl给你')
                //改变预览背景
                $('.background-preview').css('background-image', 'url(images/sexy_girl.jpg)');
                //改变父页面背景
                winui.resetBg('images/sexy_girl.jpg');

                $(this).val('').off('change');
            }
        })
    });
    //锁屏界面点击
    $('.lockscreen-choose>img').on('click', function () {
        //获取当前图片路径
        var bgSrc = $(this).prop('src');
        //改变锁屏预览
        $('.lockscreen-preview').css('background-image', 'url(' + bgSrc + ')');
        //设置锁屏背景
        winui.resetLockBg(bgSrc);
    })
    //锁屏界面图片上传
    $('.lockscreen-upload').on('click', function () {
        var input = $(this).prev('input[type=file]');
        input.trigger('click');
        input.on('change', function () {
            var src = $(this).val();
            if (src) {
                layer.msg('选择了路径【' + src + '】下的图片，返回一张性感的Girl给你')
                //改变锁屏预览
                $('.lockscreen-preview').css('background-image', 'url(images/sexy_girl.jpg');
                //设置锁屏背景
                winui.resetLockBg('images/sexy_girl.jpg');
                $(this).val('').off('change');
            }
        })
    });
    //颜色选择
    $('.color-choose>div').on('click', function () {
        var color = Number($(this)[0].classList[0].replace('theme-color-', ''));
        winui.resetColor(color);
    });

    form.on('switch(toggleTransparent)', function (data) {
        if (data.elem.checked) {
            $(data.elem).siblings('span').text('开');
        } else {
            $(data.elem).siblings('span').text('关');
        }
        layer.msg(unfinished);
    });

    form.on('switch(toggleTaskbar)', function (data) {
        if (data.elem.checked) {
            $(data.elem).siblings('span').text('开');
        } else {
            $(data.elem).siblings('span').text('关');
        }
    });
    //任务栏位置
    form.on('radio(taskPosition)', function (data) {
        switch (data.value) {
            case 'top':
                winui.resetTaskbar(data.value);
                break;
            case 'bottom':
                winui.resetTaskbar(data.value);
                break;
            case 'left':
                winui.window.msg(unfinished);
                break;
            case 'right':
                winui.window.msg(unfinished);
                break;
            default:
        }
    });
    //开始菜单尺寸
    form.on('radio(startSize)', function (data) {
        winui.resetStartSize(data.value);
    });
});