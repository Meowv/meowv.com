/**

 @Name：layuiAdmin 工单系统
 @Author：star1029
 @Site：http://www.layui.com/admin/
 @License：GPL-2
    
 */


layui.define(['table', 'form', 'element'], function(exports){
  var $ = layui.$
  ,table = layui.table
  ,form = layui.form
  ,element = layui.element;

  table.render({
    elem: '#LAY-app-system-order'
    ,url: layui.setter.base + 'json/workorder/demo.js' //模拟接口
    ,cols: [[
      {type: 'numbers', fixed: 'left'}
      ,{field: 'orderid', width: 100, title: '工单号', sort: true}
      ,{field: 'attr', width: 100, title: '业务性质'}
      ,{field: 'title', width: 100, title: '工单标题', width: 300}
      ,{field: 'progress', title: '进度', width: 200, align: 'center', templet: '#progressTpl'}
      ,{field: 'submit', width: 100, title: '提交者'}
      ,{field: 'accept', width: 100, title: '受理人员'}
      ,{field: 'state', title: '工单状态', templet: '#buttonTpl', minWidth: 80, align: 'center'}
      ,{title: '操作', align: 'center', fixed: 'right', toolbar: '#table-system-order'}
    ]]
    ,page: true
    ,limit: 10
    ,limits: [10, 15, 20, 25, 30]
    ,text: '对不起，加载出现异常！'
    ,done: function(){
      element.render('progress')
    }
  });

  //监听工具条
  table.on('tool(LAY-app-system-order)', function(obj){
    var data = obj.data;
    if(obj.event === 'edit'){
      var tr = $(obj.tr);
      layer.open({
        type: 2
        ,title: '编辑工单'
        ,content: '../../../views/app/workorder/listform.html'
        ,area: ['450px', '450px']
        ,btn: ['确定', '取消']
        ,yes: function(index, layero){
          var iframeWindow = window['layui-layer-iframe'+ index]
          ,submitID = 'LAY-app-workorder-submit'
          ,submit = layero.find('iframe').contents().find('#'+ submitID);

          //监听提交
          iframeWindow.layui.form.on('submit('+ submitID +')', function(data){
            var field = data.field; //获取提交的字段
            
            //提交 Ajax 成功后，静态更新表格中的数据
            //$.ajax({});
            table.reload('LAY-user-front-submit'); //数据刷新
            layer.close(index); //关闭弹层
          });  
          
          submit.trigger('click');
        }
        ,success: function(layero, index){

        }
      });
    }
  });

  exports('workorder', {})
});