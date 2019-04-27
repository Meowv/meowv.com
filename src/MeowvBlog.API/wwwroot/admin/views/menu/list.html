<!-- 菜单列表的html页 -->
<div class="winui-toolbar">
    <div class="winui-tool">
        <button id="btn-reloadTable" class="winui-toolbtn"><i class="fa fa-refresh" aria-hidden="true"></i>刷新数据</button>
        <button id="btn-addMenu" class="winui-toolbtn"><i class="fa fa-plus" aria-hidden="true"></i>新增菜单</button>
        <button id="btn-editMenu" class="winui-toolbtn"><i class="fa fa-pencil" aria-hidden="true"></i>编辑菜单</button>
        <button id="btn-deleteMenu" class="winui-toolbtn"><i class="fa fa-trash" aria-hidden="true"></i>删除选中</button>
    </div>
</div>
<div style="margin:auto 10px;">
    <table id="menuhtml" lay-filter="menutable"></table>
    <script type="text/html" id="barMenu">
        <a class="layui-btn layui-btn-xs " lay-event="setting">功能设置</a>
        <a class="layui-btn layui-btn-xs " lay-event="edit">编辑</a>
        <a class="layui-btn layui-btn-danger layui-btn-xs " lay-event="del">删除</a>
    </script>
    <script type="text/html" id="openTypeTpl">
        {{#  if(d.openType == 1){ }}
        HTML
        {{#  } else if(d.openType==2) { }}
        Iframe
        {{#  } }}
    </script>
    <script type="text/html" id="isNecessary">
        {{#  if(d.isNecessary){ }}
        是
        {{#  } else { }}
        否
        {{#  } }}
    </script>
    <div class="tips">Tips：1.系统菜单不可以删除 2.修改或添加数据后暂不支持自动刷新表格 3.顺序栏可编辑 4.表格用法请移步：<a style="color:#0094ff" href="http://www.layui.com/doc/modules/table.html" target="_blank">layui文档</a></div>
</div>
<script>
    layui.config({
        base: 'lib/winui/js/' //指定 winui 路径
        , version: '1.0.0-beta'
    }).use(['table', 'winui'], function () {

        winui.renderColor();

        var table = layui.table,
            $ = layui.$, tableId = 'tableidhtml';
        //表格渲染
        table.render({
            id: tableId,
            elem: '#menuhtml',
            url: '../../json/menulist.json',
            //height: 'full-65', //自适应高度
            //size: '',   //表格尺寸，可选值sm lg
            //skin: '',   //边框风格，可选值line row nob
            //even:true,  //隔行变色
            page: true,
            limits: [10, 20, 30, 40, 50, 60, 70, 100],
            limit: 10,
            cols: [[
                { field: 'id', type: 'checkbox' },
                { field: 'icon', title: '图标', width: 120 },
                { field: 'name', title: '名称', width: 150 },
                { field: 'title', title: '标题', width: 150 },
                { field: 'pageURL', title: '页面地址', width: 200 },
                { field: 'openType', title: '页面类型', width: 120, templet: '#openTypeTpl' },
                { field: 'isNecessary', title: '系统菜单', width: 100, templet: '#isNecessary' },
                { field: 'order', title: '排序', width: 80, edit: 'text' },
                { title: '操作', fixed: 'right', align: 'center', toolbar: '#barMenu', width: 200 }
            ]],
            done: function (res, curr, count) {
                //如果是异步请求数据方式，res即为你接口返回的信息。
                //如果是直接赋值的方式，res即为：{data: [], count: 99} data为当前页数据、count为数据总长度
                console.log(res);

                //得到当前页码
                console.log(curr);

                //得到数据总量
                console.log(count);
                winui.window.msg('演示请求的每页数据都是相同的。')
            }
        });
        //监听工具条
        table.on('tool(menutable)', function (obj) { //注：tool是工具条事件名，test是table原始容器的属性 lay-filter="对应的值"
            var data = obj.data; //获得当前行数据
            var layEvent = obj.event; //获得 lay-event 对应的值
            var tr = obj.tr; //获得当前行 tr 的DOM对象
            var ids = '';   //选中的Id
            $(data).each(function (index, item) {
                ids += item.id + ',';
            });
            if (layEvent === 'del') { //删除
                deleteMenu(ids, obj);
            } else if (layEvent === 'edit') { //编辑
                openEditWindow(data.id);
            } else if (layEvent === 'setting') {    //功能设置
                $.ajax({
                    type: 'get',
                    url: 'views/menu/setting.html',
                    async: false,
                    success: function (data) {
                        content = data;
                        winui.window.open({
                            id: 'settingMenu',
                            type: 1,
                            title: '功能设置',
                            content: content,
                            area: ['55vw', '70vh'],
                            offset: ['15vh', '25vw'],
                        });
                    },
                    error: function (xml) {
                        winui.window.msg("获取页面失败", {
                            icon: 2,
                            time: 2000
                        });
                        console.log(xml.responseText);
                    }
                });
            }
        });
        //监听单元格编辑
        table.on('edit(menutable)', function (obj) { //注：tool是工具条事件名，test是table原始容器的属性 lay-filter="对应的值"
            if (/^[0-9]+$/.test(obj.value)) {
                var index = winui.window.load(1);
                $.ajax({
                    type: 'post',
                    url: '/api/menu/updatemenuorder',
                    data: { "id": obj.data.id, "order": obj.value },
                    success: function (json) {
                        layer.close(index);
                        if (!json.isSucceed) {
                            msg(json.message);
                        }
                    },
                    error: function (xml) {
                        msg("修改失败", {
                            icon: 2,
                            time: 2000
                        });
                        console.log(xml.responseText);
                    }
                });
            }
        });
        //打开编辑窗口
        function openEditWindow(id) {
            if (!id) return;
            var content;
            var index = winui.window.load();
            $.ajax({
                type: 'get',
                url: 'views/menu/edit.html?id=' + id,
                async: true,
                success: function (data) {
                    layer.close(index);
                    content = data;
                    //从桌面打开
                    winui.window.open({
                        id: 'editMenu',
                        type: 1,
                        title: '编辑菜单',
                        content: content,
                        area: ['50vw', '70vh'],
                        offset: ['15vh', '25vw'],
                    });
                },
                error: function (xml) {
                    msg("获取页面失败", {
                        icon: 2,
                        time: 2000
                    });
                    console.log(xml.responseText);
                }
            });
        }
        //删除菜单
        function deleteMenu(ids, obj) {
            var msg = obj ? '确认删除菜单【' + obj.data.name + '】吗？' : '确认删除选中数据吗？';
            winui.window.confirm(msg, { icon: 3, title: '删除系统菜单' }, function (index) {
                layer.close(index);
                //向服务端发送删除指令
                obj.del(); //删除对应行（tr）的DOM结构
                winui.window.msg('服务器删除后，刷新表格', { time: 2000 });
                setTimeout(function () {
                    reloadTable();  //直接刷新表格
                }, 1000);
            });
        }
        //表格刷新
        function reloadTable() {
            table.reload(tableId, {});
        }
        //绑定工具栏添加按钮事件
        $('#btn-addMenu').on('click', function () {
            var content;
            $.ajax({
                type: 'get',
                url: 'views/menu/add.html',
                async: false,
                success: function (data) {
                    content = data;
                    //从桌面打开
                    winui.window.open({
                        id: 'addMenu',
                        type: 1,
                        title: '新增菜单',
                        content: content,
                        area: ['50vw', '70vh'],
                        offset: ['15vh', '25vw'],
                    });
                }
            });
        });
        //绑定工具栏编辑按钮事件
        $('#btn-editMenu').on('click', function (e) {
            var checkStatus = table.checkStatus(tableId);
            var checkCount = checkStatus.data.length;
            if (checkCount < 1) {
                winui.window.msg('请选择一条数据', {
                    time: 2000
                });
                return false;
            }
            if (checkCount > 1) {
                winui.window.msg('只能选择一条数据', {
                    time: 2000
                });
                return false;
            }
            openEditWindow(checkStatus.data[0].id);
        });
        //绑定工具栏删除按钮事件
        $('#btn-deleteMenu').on('click', function () {
            var checkStatus = table.checkStatus(tableId);
            var checkCount = checkStatus.data.length;
            if (checkCount < 1) {
                winui.window.msg('请选择一条数据', {
                    time: 2000
                });
                return false;
            }
            var ids = '';
            $(checkStatus.data).each(function (index, item) {
                ids += item.id + ',';
            });
            deleteMenu(ids);
        });
        //绑定工具栏刷新按钮事件
        $('#btn-reloadTable').on('click', reloadTable);
    });

</script>