/**
 * OnlyOffice v7 浏览器补丁。
 *
 * 处理 Safari 的 requestIdleCallback 兼容，并仅为 spreadsheet 编辑器映射桌面端字体路径。
 * DOC/PPT 按 glyph-ID 绘制，替换成不同字体文件会导致字形错位，必须让其使用内置字体数据。
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

  var fallbackFont = 'NotoSansSC-Regular.ttf';
  var disableFontRemap = window.location.pathname.indexOf('spreadsheeteditor') === -1;

  function extractFilename(path) {
    return path.split(/[/\\]/).pop().toLowerCase();
  }

  function mappedFontUrl(fileName) {
    var mappedFile = fontMap[fileName] || fallbackFont;
    return base + 'fonts/' + mappedFile + '?source=' + encodeURIComponent(fileName) + '&v=2026-08-06-5';
  }

  var originalOpen = window.XMLHttpRequest.prototype.open;
  window.XMLHttpRequest.prototype.open = function (method, url) {
    this.__officeSkipDesktopFont = false;
    if (typeof url === 'string') {
      var fileName;
      if (url.indexOf('ascdesktop://fonts/') === 0) {
        fileName = extractFilename(url.slice(19));
        if (disableFontRemap) {
          this.__officeSkipDesktopFont = true;
          arguments[1] = base + 'font-fallback/' + encodeURIComponent(fileName);
        } else {
          arguments[1] = mappedFontUrl(fileName);
        }
      } else if (/^[a-zA-Z]:[/\\]/.test(url)) {
        fileName = extractFilename(url);
        if (disableFontRemap) {
          this.__officeSkipDesktopFont = true;
          arguments[1] = base + 'font-fallback/' + encodeURIComponent(fileName);
        } else {
          arguments[1] = mappedFontUrl(fileName);
        }
      } else if (!disableFontRemap && url.indexOf('/fonts/') !== -1) {
        fileName = url.slice(url.lastIndexOf('/fonts/') + 7).split('?')[0].toLowerCase();
        if (fontMap[fileName]) arguments[1] = mappedFontUrl(fileName);
      }
    }
    return originalOpen.apply(this, arguments);
  };

  var originalSend = window.XMLHttpRequest.prototype.send;
  window.XMLHttpRequest.prototype.send = function () {
    if (!this.__officeSkipDesktopFont) return originalSend.apply(this, arguments);
    var request = this;
    window.setTimeout(function () {
      request.dispatchEvent(new Event('error'));
    }, 0);
  };
})();
