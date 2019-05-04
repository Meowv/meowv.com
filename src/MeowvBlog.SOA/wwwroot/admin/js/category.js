layui.config({
    base: '/admin/lib/'
    , version: '1.0.0'
}).extend({
    winui: 'winui/winui',
    window: 'winui/js/winui.window'
}).define(['table', 'jquery', 'winui', 'window', 'layer'], function (exports) {

    winui.renderColor();

    var table = layui.table,
        $ = layui.$, tableId = 'tableid';

    //桌面显示提示消息的函数
    var msg = top.winui.window.msg;

    //表格渲染
    table.render({
        id: tableId,
        elem: '#category',
        url: '/category/query',
        cols: [[
            { field: 'id', type: 'checkbox' },
            { field: 'categoryName', title: '分类名称' },
            { field: 'displayName', title: 'URL展示名称' },
            { field: 'creationTime', title: '创建时间' },
            { title: '操作', fixed: 'right', align: 'center', toolbar: '#barCategory' }
        ]],
        response: {
            msgName: 'message',
            dataName: 'result'
        }
    });

    //监听工具条
    table.on('tool(categorytable)', function (obj) {
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
        }

    });
    //监听单元格编辑
    table.on('edit(categorytable)', function (obj) {
        if (/^[0-9]+$/.test(obj.value)) {
            var index = layer.load(1);
            $.ajax({
                type: 'post',
                url: 'views/menu/updatemenuorder',
                data: { "id": obj.data.id, "order": obj.value },
                success: function (json) {
                    layer.close(index);
                    if (!json.isSucceed) {
                        msg(json.message);
                    }
                },
                error: function (xml) {
                    layer.close(index);
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
        var index = layer.load(1);
        $.ajax({
            type: 'get',
            url: 'edit.html?id=' + id,
            success: function (data) {
                layer.close(index);
                content = data;
                //从桌面打开
                top.winui.window.open({
                    id: 'editcategory',
                    type: 1,
                    title: '编辑菜单',
                    content: content,
                    area: ['50vw', '70vh'],
                    offset: ['15vh', '25vw'],
                });
            },
            error: function (xml) {
                layer.close(index);
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
        top.winui.window.confirm(msg, { icon: 3, title: '删除系统菜单' }, function (index) {
            layer.close(index);

            msg('删除成功', {
                icon: 1,
                time: 2000
            });
            //刷新表格
            if (obj) {
                obj.del(); //删除对应行（tr）的DOM结构
            } else {
                reloadTable();  //直接刷新表格
            }
        });
    }
    //表格刷新
    function reloadTable() {
        table.reload(tableId, {});
    }
    //绑定工具栏添加按钮事件
    $('#addCategory').on('click', function () {
        var content;
        var index = layer.load(1);
        $.ajax({
            type: 'get',
            url: 'add.html',
            success: function (data) {
                layer.close(index);
                content = data;
                //从桌面打开
                top.winui.window.open({
                    id: 'addCategory',
                    type: 1,
                    title: '新增菜单',
                    content: content,
                    area: ['50vw', '70vh'],
                    offset: ['15vh', '25vw']
                });
            },
            error: function (xml) {
                layer.close(load);
                msg('操作失败', {
                    icon: 2,
                    time: 2000
                });
                console.error(xml.responseText);
            }
        });
    });
    //绑定工具栏编辑按钮事件
    $('#editCategoryu').on('click', function () {
        var checkStatus = table.checkStatus(tableId);
        var checkCount = checkStatus.data.length;
        if (checkCount < 1) {
            msg('请选择一条数据', {
                time: 2000
            });
            return false;
        }
        if (checkCount > 1) {
            msg('只能选择一条数据', {
                time: 2000
            });
            return false;
        }
        openEditWindow(checkStatus.data[0].id);
    });
    //绑定工具栏删除按钮事件
    $('#deleteCategory').on('click', function () {
        var checkStatus = table.checkStatus(tableId);
        var checkCount = checkStatus.data.length;
        if (checkCount < 1) {
            msg('请选择一条数据', {
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
    $('#reloadTable').on('click', reloadTable);

    exports('category', {});
});