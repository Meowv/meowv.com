<div class="winui-hprsetings-content">
    <div class="layui-tab layui-tab-brief" lay-filter="settings">
        <ul class="layui-tab-title">
            <li class="layui-this">基本设置</li>
            <li>背景设置</li>
        </ul>
        <div class="layui-tab-content">
            <div class="layui-tab-item layui-show">

                <fieldset class="layui-elem-field">
                    <legend>基本设置</legend>
                    <div class="layui-field-box basic">
                        <div class="layui-form">
                            <input id="dblhide" type="checkbox" lay-filter="dblhide" title="双击桌面空白处隐藏桌面图标" lay-skin="primary" checked>
                        </div>
                    </div>
                </fieldset>
            </div>
            <div class="layui-tab-item">
                <fieldset class="layui-elem-field">
                    <legend>背景色</legend>
                    <div class="layui-field-box">
                        <div class="bgcolor-item selected" data-color="#010101">
                            <div></div>
                        </div>
                        <div class="bgcolor-item" data-color="#EC6401">
                            <div></div>
                        </div>
                        <div class="bgcolor-item" data-color="#D8A508">
                            <div></div>
                        </div>
                        <div class="bgcolor-item" data-color="#FFF001">
                            <div></div>
                        </div>
                        <div class="bgcolor-item" data-color="#90C420">
                            <div></div>
                        </div>
                        <div class="bgcolor-item" data-color="#23AE36">
                            <div></div>
                        </div>
                        <div class="bgcolor-item" data-color="#019F95">
                            <div></div>
                        </div>
                        <div class="bgcolor-item" data-color="#E50178">
                            <div></div>
                        </div>
                        <div class="bgcolor-item" data-color="#1FBDDF">
                            <div></div>
                        </div>
                        <div class="bgcolor-item" data-color="#8DA5E8">
                            <div></div>
                        </div>
                        <div class="bgcolor-item" data-color="#01479D">
                            <div></div>
                        </div>
                        <div class="bgcolor-item" data-color="#FF0101">
                            <div></div>
                        </div>
                        <div class="bgcolor-item" data-color="#7F013F">
                            <div></div>
                        </div>
                        <div class="bgcolor-item" data-color="#8858A0">
                            <div></div>
                        </div>
                    </div>
                </fieldset>
                <fieldset class="layui-elem-field">
                    <legend>透明度</legend>
                    <div class="layui-field-box">
                        <div class="slidearea">
                            <div id="opacity" class="layui-progress" lay-filter="opacity">
                                <div class="layui-progress-bar layui-bg-blue"></div>
                                <span class="slider"></span>
                            </div>
                        </div>
                    </div>
                </fieldset>
                <div style="padding:10px 0;text-align:right">
                    <button id="defult" class="layui-btn layui-btn-normal layui-btn-xs">恢复默认</button>
                </div>
            </div>
        </div>
    </div>
</div>
<script>
    layui.use(['element', 'form'], function (element, form) {
        var $ = layui.jquery
            , setSlider = function (opacity, filter) {
                var selectFilte = '';
                if (filter)
                    selectFilter = '[lay-filter="' + filter + '"]';
                //设置进度条位置
                element.progress(filter, opacity * 100 + '%');
                //设置滑块位置
                $('.slider').css('left', $('.layui-progress' + selectFilter).children('.layui-progress-bar')[0].offsetWidth - 5 + 'px');
            }
            , selectBg = function (bgColor) {
                $('.bgcolor-item[data-color="' + bgColor + '"]').addClass('selected').siblings().removeClass('selected');
            };

        if (winui.helper.dblhide) {
            $('#dblhide').attr('checked', true);
        } else {
            $('#dblhide').removeAttr('checked');
        }
        form.render();

        //监听选项卡切换
        element.on('tab(settings)', function (data) {
            if (data.index == 1) {
                setSlider(winui.helper.opacity, 'opacity');
                $('.bgcolor-item[data-color="' + winui.helper.bgColor + '"]').addClass('selected').siblings().removeClass('selected');
            }
        });

        //初始化背景颜色选择器
        $('.bgcolor-item').each(function (index, item) {
            $(item).children('div').css('background-color', $(item).data('color'));
        });

        //背景颜色设置
        $('.bgcolor-item').on('click', function () {
            $(this).addClass('selected').siblings().removeClass('selected');
            var bgColor = $(this).data('color');
            winui.helper.bgset({
                bgColor: bgColor
            });
        });

        //恢复默认
        $('#defult').on('click', function () {
            winui.helper.bgReset();
            setSlider(winui.helper.opacity, 'opacity');
            selectBg(winui.helper.bgColor);
        });

        var move = false;

        //鼠标按下
        $('.slidearea').on('mousedown', function (event) {
            if (event.button === 0) {
                move = true;

                var offsetX = event.target == $('.slider')[0] ? Number($(event.target).css('left').replace('px', '')) + event.offsetX : event.offsetX;

                var opacity = Math.round(offsetX / $(this).width() * 100) / 100;

                setSlider(opacity, 'opacity');

                winui.helper.bgset({
                    opacity: opacity
                });
            }
        });
        //鼠标移动
        $(".slidearea").on("mousemove", function (event) {
            event.preventDefault();
            if (move) {

                var offsetX = event.target == $('.slider')[0] ? Number($(event.target).css('left').replace('px', '')) + event.offsetX : event.offsetX;

                var opacity = Math.round(offsetX / $(this).width() * 100) / 100;

                setSlider(opacity, 'opacity');

                winui.helper.bgset({
                    opacity: opacity
                });
            }
        });
        //鼠标松开
        $(document).on("mouseup", function (event) {
            event.preventDefault();
            move = false;
        });

        //双击隐藏桌面图标
        form.on('checkbox(dblhide)', function (data) {
            winui.helper.toggleHide(data.elem.checked);
        });
    });
</script>