layui.config({
    base: '../../lib/winui/' //指定 winui 路径
    , version: '1.0.0-beta'
}).define(['table', 'jquery', 'winui'], function (exports) {

    winui.renderColor();

    var table = layui.table,
        $ = layui.$,
        tableId = 'tableid';
    //表格渲染
    table.render({
        id: tableId,
        elem: '#role',
        url: '../../json/rolelist.json',
        //height: 'full-65', //自适应高度
        //size: '',   //表格尺寸，可选值sm lg
        //skin: '',   //边框风格，可选值line row nob
        //even:true,  //隔行变色
        page: true,
        limits: [8, 16, 24, 32, 40, 48, 56],
        limit: 8,
        cols: [[
            { field: 'id', type: 'checkbox' },
            { field: 'roleName', title: '名称', width: 120 },
            { field: 'description', title: '描述', width: 582 },
            { field: 'dataState', title: '状态', width: 60, templet: '#stateTpl' },
            { title: '操作', fixed: 'right', align: 'center', toolbar: '#barRole', width: 120 }
        ]]
    });
    //监听工具条
    table.on('tool(roletable)', function (obj) { //注：tool是工具条事件名，test是table原始容器的属性 lay-filter="对应的值"
        var data = obj.data; //获得当前行数据
        var layEvent = obj.event; //获得 lay-event 对应的值
        var tr = obj.tr; //获得当前行 tr 的DOM对象
        var ids = '';   //选中的Id
        $(data).each(function (index, item) {
            ids += item.id + ',';
        });
        if (layEvent === 'del') { //删除
            deleteRole(ids, obj);
        } else if (layEvent === 'edit') { //编辑
            if (!data.id) return;
            var content;
            var index = layer.load(1);
            $.ajax({
                type: 'get',
                url: 'edit.html?id=' + data.id,
                async: true,
                success: function (data) {
                    layer.close(index);
                    content = data;
                    //从桌面打开
                    top.winui.window.open({
                        id: 'editRole',
                        type: 1,
                        title: '编辑角色',
                        content: content,
                        area: ['60vw', '70vh'],
                        offset: ['15vh', '20vw'],
                    });
                    top.winui.window.msg("选择框带联动的,尽情享用", {
                        time: 2000
                    });
                },
                error: function (xml) {
                    layer.close(index);
                    top.winui.window.msg("获取页面失败", {
                        icon: 2,
                        time: 2000
                    });
                    console.log(xml.responseText);
                }
            });
        }
    });
    //表格重载
    function reloadTable() {
        table.reload(tableId, {});
    }

    //打开添加页面
    function addRole() {
        top.winui.window.msg("自行脑补画面", {
            icon: 2,
            time: 2000
        });
    }
    //删除角色
    function deleteRole(ids, obj) {
        var msg = obj ? '确认删除角色【' + obj.data.roleName + '】吗？' : '确认删除选中数据吗？'
        top.winui.window.confirm(msg, { icon: 3, title: '删除系统角色' }, function (index) {
            layer.close(index);
            //向服务端发送删除指令
            //刷新表格
            if (obj) {
                top.winui.window.msg('删除成功', {
                    icon: 1,
                    time: 2000
                });
                obj.del(); //删除对应行（tr）的DOM结构
            } else {
                top.winui.window.msg('向服务端发送删除指令后刷新表格即可', {
                    time: 2000
                });
                reloadTable();  //直接刷新表格
            }
        });
    }
    //绑定按钮事件
    $('#addRole').on('click', addRole);
    $('#deleteRole').on('click', function () {
        var checkStatus = table.checkStatus(tableId);
        var checkCount = checkStatus.data.length;
        if (checkCount < 1) {
            top.winui.window.msg('请选择一条数据', {
                time: 2000
            });
            return false;
        }
        var ids = '';
        $(checkStatus.data).each(function (index, item) {
            ids += item.id + ',';
        });
        deleteRole(ids);
    });
    $('#reloadTable').on('click', reloadTable);

    exports('rolelist', {});
});
