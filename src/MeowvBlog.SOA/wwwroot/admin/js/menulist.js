//@ sourceURL=menulist.js
layui.config({
    base: '../../lib/' //指定 winui 路径
    , version: '1.0.0-beta'
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
        elem: '#menu',
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
        ]]
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
                url: 'setting.html?menuId=' + data.id,
                async: false,
                success: function (data) {
                    content = data;
                    //从桌面打开
                    top.winui.window.open({
                        id: 'settingMenu',
                        type: 1,
                        title: '权限设置',
                        content: content,
                        area: ['55vw', '70vh'],
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
    });
    //监听单元格编辑
    table.on('edit(menutable)', function (obj) { //注：tool是工具条事件名，test是table原始容器的属性 lay-filter="对应的值"
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
                    id: 'editMenu',
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
    $('#addMenu').on('click', function () {
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
                    id: 'addMenu',
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
    $('#editMenu').on('click', function () {
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
    $('#deleteMenu').on('click', function () {
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

    exports('menulist', {});
});
