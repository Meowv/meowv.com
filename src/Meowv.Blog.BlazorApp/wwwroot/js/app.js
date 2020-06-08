var func = window.func || {};

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
    doa: function () {
        console.log(1);

        dynamicLoading.js("/js/jquery-3.4.1.min.js")
        dynamicLoading.js("/editor.md/editormd.min.js")
        dynamicLoading.js("/editor.md/lib/marked.min.js")
        dynamicLoading.js("/editor.md/lib/prettify.min.js")

        dynamicLoading.css("/editor.md/css/editormd.preview.min.css")
    },
    dob: function () {
        console.log(2);
        editormd.markdownToHTML("content");
    }
};

var dynamicLoading = {
    css: function (path) {
        if (!path || path.length === 0) {
            throw new Error('argument "path" is required !');
        }
        var head = document.getElementsByTagName('head')[0];
        var link = document.createElement('link');
        link.href = `https://static.meowv.com` + path;
        link.rel = 'stylesheet';
        link.type = 'text/css';
        head.appendChild(link);
    },
    js: function (path) {
        if (!path || path.length === 0) {
            throw new Error('argument "path" is required !');
        }
        var head = document.getElementsByTagName('head')[0];
        var script = document.createElement('script');
        script.src = `https://static.meowv.com` + path;
        script.type = 'text/javascript';
        head.appendChild(script);
    }
}