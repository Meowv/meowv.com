<style>
    td[data-field=id],
    td[data-field=menuId],
    th[data-field=id],
    th[data-field=menuId] {
        display: none;
    }
</style>
<div class="txtcenter" style="width:700px;margin:0 auto;padding-top:20px;">
    <form class="layui-form layui-form-pane" action="">
        <input type="hidden" name="menuId" value="2" />
        <input type="hidden" name="id" value="0" />
        <div class="layui-form-item">
            <div class="layui-inline">
                <label class="layui-form-label">名称</label>
                <div class="layui-input-inline">
                    <input type="text" name="name" autocomplete="off" placeholder="请输入功能名称" class="layui-input" win-verify="required" />
                </div>
                <label class="layui-form-label">功能描述</label>
                <div class="layui-input-inline">
                    <input type="text" name="description" placeholder="请输入功能描述" autocomplete="off" class="layui-input" />
                </div>
            </div>
        </div>
        <div class="layui-form-item">
            <div class="layui-inline">
                <label class="layui-form-label">Controller</label>
                <div class="layui-input-inline">
                    <input type="text" name="controller" placeholder="请输入控制器名称" autocomplete="off" class="layui-input" win-verify="required" />
                </div>
                <div class="layui-form-label">Action</div>
                <div class="layui-input-inline">
                    <input type="text" name="action" placeholder="请输入动作方法名称" autocomplete="off" class="layui-input" win-verify="required" />
                </div>
            </div>
        </div>
        <div class="layui-form-item">
            <div class="layui-input-block" style="margin:0;">
                <button class="layui-btn" lay-submit lay-filter="formMenuSetting">立即提交</button>
            </div>
        </div>
    </form>
</div>
<hr class="layui-bg-blue">
<div style="margin:auto 10px;">
    <table lay-filter="menuSettingTable">
        <thead>
            <tr>
                <th lay-data="{field:'id', width:100}">编号</th>
                <th lay-data="{field:'menuId', width:100}">菜单编号</th>
                <th lay-data="{field:'name', width:100}">名称</th>
                <th lay-data="{field:'description', width:100}">描述</th>
                <th lay-data="{field:'controller', width:150}">Controller</th>
                <th lay-data="{field:'action', width:150}">Action</th>
                <th lay-data="{field:'dataState', width:100}">状态</th>
                <th lay-data="{ fixed: 'right', width: 150, align: 'center', toolbar: '#barMenuSetting'}">操作</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>3</td>
                <td>2</td>
                <td>新增菜单</td>
                <td>新增菜单</td>
                <td>Menu</td>
                <td>Post</td>
                <td>禁用</td>
            </tr>
            <tr>
                <td>4</td>
                <td>2</td>
                <td>编辑菜单</td>
                <td>编辑菜单</td>
                <td>Menu</td>
                <td>Put</td>
                <td>禁用</td>
            </tr>
            <tr>
                <td>5</td>
                <td>2</td>
                <td>删除菜单</td>
                <td>删除菜单</td>
                <td>Menu</td>
                <td>Delete</td>
                <td>启用</td>
            </tr>
            <tr>
                <td>17</td>
                <td>2</td>
                <td>增改功能</td>
                <td>添加或修改菜单功能</td>
                <td>Function</td>
                <td>Post</td>
                <td>启用</td>
            </tr>
            <tr>
                <td>18</td>
                <td>2</td>
                <td>删除功能</td>
                <td>删除菜单包含的功能</td>
                <td>Function</td>
                <td>Delete</td>
                <td>启用</td>
            </tr>
        </tbody>
    </table>
    <script type="text/html" id="barMenuSetting">
        <a class="layui-btn layui-btn-xs" lay-event="edit">编辑</a>
        <a class="layui-btn layui-btn-danger layui-btn-xs" lay-event="del">删除</a>
    </script>
</div>

<script>
    layui.use(['table', 'form'], function () {
        var table = layui.table,
            form = layui.form,
            $ = layui.$,
            tableId = 'tableid';
        form.render();

        //转换静态表格
        table.init('menuSettingTable', {
            id: tableId
        });

        //表格刷新
        function reloadTable() {
            table.reload(tableId, {});
        }

        //监听工具条
        table.on('tool(menuSettingTable)', function (obj) { //注：tool是工具条事件名，test是table原始容器的属性 lay-filter="对应的值"
            var data = obj.data; //获得当前行数据
            var layEvent = obj.event; //获得 lay-event 对应的值
            var tr = obj.tr; //获得当前行 tr 的DOM对象

            var ids = '';   //选中的Id
            $(data).each(function (index, item) {
                ids += item.id + ',';
            });
            if (layEvent === 'del') { //删除
                winui.window.confirm('确定删除吗？', { icon: 3, title: '删除菜单权限' }, function (index) {
                    layer.close(index);
                    //向服务端发送删除指令
                    obj.del(); //删除对应行（tr）的DOM结构
                    winui.window.msg('服务器删除后，刷新表格', { time: 2000 });
                    setTimeout(function () {
                        reloadTable();  //直接刷新表格
                    }, 1000);
                });
            } else if (layEvent === 'edit') { //编辑
                winui.window.msg('重新获取编辑视图，替换掉当前html');

                //$('#settingMenu').html(editview);
            }
        });

        //监听表单提交
        form.on('submit(formMenuSetting)', function (data) {
            //表单验证
            try {
                if (winui.verifyForm(data.elem)) {
                    winui.window.msg('表单验证成功，提交数据');
                }
            } catch (e) {
                return false;
            }
            return false;
        });
    });
</script>
