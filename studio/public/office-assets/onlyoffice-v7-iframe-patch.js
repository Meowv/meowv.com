/**
 * OnlyOffice v7 浏览器补丁。
 *
 * 处理 Safari 的 requestIdleCallback 兼容，并为所有编辑器映射桌面端字体路径。
 * 路径从脚本自身地址推导，因此支持站点根目录和子目录部署。
 */
(function () {
  if (typeof window.requestIdleCallback !== 'function') {
    window.requestIdleCallback = function (callback) {
      var start = Date.now();
      return window.setTimeout(function () {
        callback({
          didTimeout: false,
          timeRemaining: function () {
            return Math.max(0, 50 - (Date.now() - start));
          },
        });
      }, 1);
    };
    window.cancelIdleCallback = function (id) {
      window.clearTimeout(id);
    };
  }

  var base =
    document.currentScript && document.currentScript.src ? document.currentScript.src.replace(/[^/]+$/, '') : '/';
  var fontMap = {};
  fetch(base + 'font-map.json')
    .then(function (response) {
      return response.json();
    })
    .then(function (mapping) {
      delete mapping._comment;
      fontMap = mapping;
    })
    .catch(function () {});

  var fallbackFont = 'NotoSansSC-VF.ttf';

  function extractFilename(path) {
    return path.split(/[/\\]/).pop().toLowerCase();
  }

  var originalOpen = window.XMLHttpRequest.prototype.open;
  window.XMLHttpRequest.prototype.open = function (method, url) {
    if (typeof url === 'string') {
      var fileName;
      if (url.indexOf('ascdesktop://fonts/') === 0) {
        fileName = extractFilename(url.slice(19));
        arguments[1] = base + 'fonts/' + (fontMap[fileName] || fallbackFont);
      } else if (/^[a-zA-Z]:[/\\]/.test(url)) {
        fileName = extractFilename(url);
        arguments[1] = base + 'fonts/' + (fontMap[fileName] || fallbackFont);
      } else if (url.indexOf('/fonts/') !== -1) {
        fileName = url.slice(url.lastIndexOf('/fonts/') + 7).toLowerCase();
        if (fontMap[fileName]) arguments[1] = base + 'fonts/' + fontMap[fileName];
      }
    }
    return originalOpen.apply(this, arguments);
  };
})();
