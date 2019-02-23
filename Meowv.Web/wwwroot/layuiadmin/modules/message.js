/**

 @Name：layuiAdmin（iframe版） 消息中心
 @Author：贤心
 @Site：http://www.layui.com/admin/
 @License：LPPL
    
 */


layui.define(['admin', 'table', 'util'], function(exports){
  var $ = layui.$
  ,admin = layui.admin
  ,table = layui.table
  ,element = layui.element;
  
  var DISABLED = 'layui-btn-disabled'
  
  //区分各选项卡中的表格
  ,tabs = {
    all: {
      text: '全部消息'
      ,id: 'LAY-app-message-all'
    }
    ,notice: {
      text: '通知'
      ,id: 'LAY-app-message-notice'
    }
    ,direct: {
      text: '私信'
      ,id: 'LAY-app-message-direct'
    }
  };
  
  //标题内容模板
  var tplTitle = function(d){
    return '<a href="detail.html?id='+ d.id +'">'+ d.title;
  };
  
  //全部消息
  table.render({
    elem: '#LAY-app-message-all'
    ,url: layui.setter.base + 'json/message/all.js' //模拟接口
    ,page: true
    ,cols: [[
      {type: 'checkbox', fixed: 'left'}
      ,{field: 'title', title: '标题内容', minWidth: 300, templet: tplTitle}
      ,{field: 'time', title: '时间', width: 170, templet: '<div>{{ layui.util.timeAgo(d.time) }}</div>'}
    ]]
    ,skin: 'line'
  });
  
  //通知
  table.render({
    elem: '#LAY-app-message-notice'
    ,url: layui.setter.base + 'json/message/notice.js' //模拟接口
    ,page: true
    ,cols: [[
      {type: 'checkbox', fixed: 'left'}
      ,{field: 'title', title: '标题内容', minWidth: 300, templet: tplTitle}
      ,{field: 'time', title: '时间', width: 170, templet: '<div>{{ layui.util.timeAgo(d.time) }}</div>'}
    ]]
    ,skin: 'line'
  });
  
  //私信
  table.render({
    elem: '#LAY-app-message-direct'
    ,url: layui.setter.base + 'json/message/direct.js' //模拟接口
    ,page: true
    ,cols: [[
      {type: 'checkbox', fixed: 'left'}
      ,{field: 'title', title: '标题内容', minWidth: 300, templet: tplTitle}
      ,{field: 'time', title: '时间', width: 170, templet: '<div>{{ layui.util.timeAgo(d.time) }}</div>'}
    ]]
    ,skin: 'line'
  });
  
  
  //事件处理
  var events = {
    del: function(othis, type){
      var thisTabs = tabs[type]
      ,checkStatus = table.checkStatus(thisTabs.id)
      ,data = checkStatus.data; //获得选中的数据
      if(data.length === 0) return layer.msg('未选中行');

      layer.confirm('确定删除选中的数据吗？', function(){
        /*
        admin.req('url', {}, function(){ //请求接口
          //do somethin
        });
        */
        //此处只是演示，实际应用需把下述代码放入上述Ajax回调中
        layer.msg('删除成功', {
          icon: 1
        });
        table.reload(thisTabs.id); //刷新表格
      });
    }
    ,ready: function(othis, type){
      var thisTabs = tabs[type]
      ,checkStatus = table.checkStatus(thisTabs.id)
      ,data = checkStatus.data; //获得选中的数据
      if(data.length === 0) return layer.msg('未选中行');
      
      //此处只是演示
      layer.msg('标记已读成功', {
        icon: 1
      });
      table.reload(thisTabs.id); //刷新表格
    }
    ,readyAll: function(othis, type){
      var thisTabs = tabs[type];
      
      //do somethin
      
      layer.msg(thisTabs.text + '：全部已读', {
        icon: 1
      });
    }
  };
  
  $('.LAY-app-message-btns .layui-btn').on('click', function(){
    var othis = $(this)
    ,thisEvent = othis.data('events')
    ,type = othis.data('type');
    events[thisEvent] && events[thisEvent].call(this, othis, type);
  });
  
  exports('message', {});
});