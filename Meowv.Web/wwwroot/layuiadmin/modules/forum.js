/**

 @Name：layuiAdmin 社区系统
 @Author：star1029
 @Site：http://www.layui.com/admin/
 @License：LPPL
    
 */


layui.define(['table', 'form'], function(exports){
  var $ = layui.$
  ,table = layui.table
  ,form = layui.form;

  //帖子管理
  table.render({
    elem: '#LAY-app-forum-list'
    ,url: layui.setter.base + 'json/forum/list.js' //模拟接口
    ,cols: [[
      {type: 'checkbox', fixed: 'left'}
      ,{field: 'id', width: 100, title: 'ID', sort: true}
      ,{field: 'poster', title: '发帖人'}
      ,{field: 'avatar', title: '头像', width: 100, templet: '#imgTpl'}
      ,{field: 'content', title: '发帖内容'}
      ,{field: 'posttime', title: '发帖时间', sort: true}
      ,{field: 'top', title: '置顶', templet: '#buttonTpl', minWidth: 80, align: 'center'}
      ,{title: '操作', width: 150, align: 'center', fixed: 'right', toolbar: '#table-forum-list'}
    ]]
    ,page: true
    ,limit: 10
    ,limits: [10, 15, 20, 25, 30]
    ,text: '对不起，加载出现异常！'
  });
  
  //监听工具条
  table.on('tool(LAY-app-forum-list)', function(obj){
    var data = obj.data;
    if(obj.event === 'del'){
      layer.confirm('确定删除此条帖子？', function(index){
        obj.del();
        layer.close(index);
      });
    } else if(obj.event === 'edit'){
      var tr = $(obj.tr);

      layer.open({
        type: 2
        ,title: '编辑帖子'
        ,content: '../../../views/app/forum/listform.html'
        ,area: ['550px', '400px']
        ,btn: ['确定', '取消']
        ,resize: false
        ,yes: function(index, layero){
          var iframeWindow = window['layui-layer-iframe'+ index]
          ,submitID = 'LAY-app-forum-submit'
          ,submit = layero.find('iframe').contents().find('#'+ submitID);

          //监听提交
          iframeWindow.layui.form.on('submit('+ submitID +')', function(data){
            var field = data.field; //获取提交的字段
            
            //提交 Ajax 成功后，静态更新表格中的数据
            //$.ajax({});
            table.reload('LAY-app-forum-list'); //数据刷新
            layer.close(index); //关闭弹层
          });  
          
          submit.trigger('click');
        }
        ,success: function(layero, index){
          
        }
      });
    }
  });

  //回帖管理
  table.render({
    elem: '#LAY-app-forumreply-list'
    ,url: layui.setter.base + 'json/forum/replys.js' //模拟接口
    ,cols: [[
      {type: 'checkbox', fixed: 'left'}
      ,{field: 'id', width: 100, title: 'ID', sort: true}
      ,{field: 'replyer', title: '回帖人'}
      ,{field: 'cardid', title: '回帖ID', sort: true}
      ,{field: 'avatar', title: '头像', width: 100, templet: '#imgTpl'}
      ,{field: 'content', title: '回帖内容', width: 200}
      ,{field: 'replytime', title: '回帖时间', sort: true}
      ,{title: '操作', width: 150, align: 'center', fixed: 'right', toolbar: '#table-forum-replys'}
    ]]
    ,page: true
    ,limit: 10
    ,limits: [10, 15, 20, 25, 30]
    ,text: '对不起，加载出现异常！'
  });
  
  //监听工具条
  table.on('tool(LAY-app-forumreply-list)', function(obj){
    var data = obj.data;
    if(obj.event === 'del'){
      layer.confirm('确定删除此条评论？', function(index){
        obj.del();
        layer.close(index);
      });
    } else if(obj.event === 'edit'){
      var tr = $(obj.tr);

      layer.open({
        type: 2
        ,title: '编辑评论'
        ,content: '../../../views/app/forum/replysform.html'
        ,area: ['550px', '350px']
        ,btn: ['确定', '取消']
        ,resize: false
        ,yes: function(index, layero){
          //获取iframe元素的值
          var othis = layero.find('iframe').contents().find("#layuiadmin-form-replys");
          var content = othis.find('textarea[name="content"]').val();
          
          //数据更新
          obj.update({
            content: content
          });
          layer.close(index);
        }
        ,success: function(layero, index){
            
        }

      });
    }
  });
  
  exports('forum', {})
});