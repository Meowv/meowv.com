<div style="width:600px;margin:0 auto;padding-top:20px;">
    <form class="layui-form" action="">
        <div class="layui-form-item">
            <label class="layui-form-label">上级菜单</label>
            <div class="layui-input-block">
                <select name="parentId">
                    <option value="0">请选择上级菜单</option>
                    <option value="1">&#x4E2A;&#x6027;&#x5316;</option>
                    <option value="3">&#x6253;&#x8D4F;&#x4F5C;&#x8005;</option>
                    <option value="4">&#x57FA;&#x672C;&#x8BF4;&#x660E;</option>
                    <option value="23" selected>&#x7CFB;&#x7EDF;&#x8BBE;&#x7F6E;</option>
                    <option value="27">Font Awesome&#x56FE;&#x6807;&#x5C55;&#x793A;</option>
                    <option value="43">Font Awesome&#x7B2C;&#x4E09;&#x65B9;LOGO</option>
                    <option value="53">&#x81EA;&#x5B9A;&#x4E49;&#x56FE;&#x7247;&#x83DC;&#x5355;</option>
                    <option value="60">&#x7CFB;&#x7EDF;&#x65E5;&#x5FD7;</option>
                    <option value="62">&#x70B9;&#x8D5E;</option>
                    <option value="63">123</option>
                    <option value="66">&#x4F5C;&#x8005;&#x535A;&#x5BA2;</option>
                </select>
            </div>
        </div>
        <div class="layui-form-item">
            <label class="layui-form-label">菜单图标</label>
            <div class="layui-input-block">
                <input type="text" name="icon" win-verify="required" placeholder="请输入图标src或者class" autocomplete="off" class="layui-input" value="fa-navicon" />
            </div>
        </div>
        <div class="layui-form-item">
            <label class="layui-form-label">菜单名称</label>
            <div class="layui-input-block">
                <input type="text" name="name" win-verify="required" placeholder="请输入菜单名称" autocomplete="off" class="layui-input" value="&#x83DC;&#x5355;&#x8BBE;&#x7F6E;" />
            </div>
        </div>
        <div class="layui-form-item">
            <label class="layui-form-label">窗口标题</label>
            <div class="layui-input-block">
                <input type="text" name="title" win-verify="required" placeholder="请输入菜单名称" autocomplete="off" class="layui-input" value="&#x83DC;&#x5355;&#x8BBE;&#x7F6E;" />
            </div>
        </div>
        <div class="layui-form-item">
            <label class="layui-form-label">菜单地址</label>
            <div class="layui-input-block">
                <input type="text" name="pageurl" placeholder="请输入菜单地址" autocomplete="off" class="layui-input" value="/menu/index" />
            </div>
        </div>
        <div class="layui-form-item" pane>
            <label class="layui-form-label">菜单类型</label>
            <div class="layui-input-block winui-radio">
                <input type="radio" name="openType" value="1" title="HTML" />
                <input type="radio" name="openType" value="2" title="Iframe" checked />
            </div>
        </div>
        <div class="layui-form-item">
            <label class="layui-form-label">系统菜单</label>
            <div class="layui-input-block winui-switch">
                <input name="isNecessary" type="checkbox" lay-filter="isNecessary" lay-skin="switch" lay-text="是|否" checked value="True ">
            </div>
        </div>
        <div class="layui-form-item">
            <div class="layui-input-block">
                <button class="winui-btn" lay-submit lay-filter="formEditMenu">确定</button>
                <button class="winui-btn" onclick="winui.window.close('editMenu'); return false;">取消</button>
            </div>
        </div>
    </form>
    <div class="tips">Tips：演示的每个编辑页都是相同的</div>
</div>
<script>
    layui.use(['form'], function (form) {
        var msg = winui.window.msg,
            $ = layui.$;
        form.render();
        form.on('switch(isNecessary)', function (data) {
            //同步开关值
            $(data.elem).val(data.elem.checked);
        });
        form.on('submit(formEditMenu)', function (data) {
            console.log(data);
            //表单验证
            if (winui.verifyForm(data.elem)) {
                layui.$.ajax({
                    type: 'get',
                    url: 'json/resok.json',
                    async: false,
                    data: data.field,
                    dataType: 'json',
                    success: function (json) {
                        if (json.isSucceed) {
                            msg('修改成功', {
                                icon: 1,
                                time: 2000
                            });
                        } else {
                            msg(json.message);
                        }
                        winui.window.close('editMenu');
                    },
                    error: function (xml) {
                        msg(xml.responseText == "" ? "获取页面失败" : xml.responseText, {
                            icon: 2,
                            time: 2000
                        });
                    }
                });
            }
            return false;
        });
    });
</script>