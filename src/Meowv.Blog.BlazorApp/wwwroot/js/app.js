var func = window.func || {}, editor;

func = {
    setStorage: function (name, value) {
        localStorage.setItem(name, value);
    },
    getStorage: function (name) {
        return localStorage.getItem(name);
    },
    switchTheme: function () {
        var currentTheme = this.getStorage('theme') || 'Light';
        var isDark = currentTheme === 'Dark';

        if (isDark) {
            document.querySelector('body').classList.add('dark-theme');
        } else {
            document.querySelector('body').classList.remove('dark-theme');
        }
    },
    switchEditorTheme: function () {
        editor.setTheme(localStorage.editorTheme || 'default');
        editor.setEditorTheme(localStorage.editorTheme === 'dark' ? 'pastel-on-dark' : 'default');
        editor.setPreviewTheme(localStorage.editorTheme || 'default');
    },
    renderEditor: async function () {
        await this._loadScript('./editor.md/lib/zepto.min.js').then(function () {
            func._loadScript('./editor.md/editormd.js').then(function () {
                editor = editormd("editor", {
                    width: "100%",
                    height: 640,
                    path: './editor.md/lib/',
                    codeFold: true,
                    saveHTMLToTextarea: true,
                    emoji: true,
                    atLink: false,
                    emailLink: false,
                    theme: localStorage.editorTheme || 'default',
                    editorTheme: localStorage.editorTheme === 'dark' ? 'pastel-on-dark' : 'default',
                    previewTheme: localStorage.editorTheme || 'default',
                    toolbarIcons: function () {
                        return ["bold", "del", "italic", "quote", "ucwords", "uppercase", "lowercase", "h1", "h2", "h3", "h4", "h5", "h6", "list-ul", "list-ol", "hr", "link", "image", "code", "preformatted-text", "code-block", "table", "datetime", "html-entities", "emoji", "watch", "preview", "fullscreen", "clear", "||", "save"]
                    },
                    toolbarIconsClass: {
                        save: "fa-check"
                    },
                    toolbarHandlers: {
                        save: function (cm, icon, cursor, selection) {
                            // TODO:如何通知后端我点了这个按钮。
                        }
                    }
                });
            });
        });
    },
    _loadScript: async function (url) {
        let response = await fetch(url);
        var js = await response.text();
        eval(js);
    }
};