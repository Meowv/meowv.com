api_domain = "https://api.meowv.com";
var _mtac = { "performanceMonitor": 1, "senseQuery": 1 };
(function () {
    var mta = document.createElement("script");
    mta.src = "//pingjs.qq.com/h5/stats.js?v2.0.4";
    mta.setAttribute("name", "MTAH5");
    mta.setAttribute("sid", "500692160");
    mta.setAttribute("cid", "500692161");
    var s = document.getElementsByTagName("script")[0];
    s.parentNode.insertBefore(mta, s);

    var ie = !!(window.attachEvent && !window.opera);
    var wk = /webkit\/(\d+)/i.test(navigator.userAgent) && (RegExp.$1 < 525);
    var fn = [];
    var run = function () {
        for (var i = 0; i < fn.length; i++) fn[i]();
    };
    var d = document;
    d.ready = function (f) {
        if (!ie && !wk && d.addEventListener)
            return d.addEventListener('DOMContentLoaded', f, false);
        if (fn.push(f) > 1) return;
        if (ie)
            (function () {
                try {
                    d.documentElement.doScroll('left');
                    run();
                } catch (err) {
                    setTimeout(arguments.callee, 0);
                }
            })();
        else if (wk)
            var t = setInterval(function () {
                if (/^(loaded|complete)$/.test(d.readyState))
                    clearInterval(t), run();
            }, 0);
    };
})();

document.ready(
    // toggleTheme function.
    function () {
        var _Blog = window._Blog || {};
        const currentTheme = window.localStorage && window.localStorage.getItem('theme');
        const isDark = currentTheme === 'dark';

        var model_path = "black";

        if (isDark) {
            document.getElementById("switch_default").checked = true;
            // mobile
            document.getElementById("mobile-toggle-theme").innerText = " · Dark"

            model_path = "white";
        } else {
            document.getElementById("switch_default").checked = false;
            // mobile
            document.getElementById("mobile-toggle-theme").innerText = " · Dark"

            model_path = "black";
        }

        L2Dwidget.init({
            model: {
                jsonPath: `https://static.meowv.com/live2d/tororo/assets/tororo.model_${model_path}.json`,
            },
            display: {
                superSample: 1.5,
                width: 100,
                height: 100,
                position: 'right',
                hOffset: 5,
                vOffset: 5,
            },
            mobile: {
                show: true,
                scale: 1,
                motion: true,
            },
            react: {
                opacityDefault: 0.5,
                opacityOnHover: 0.2,
            }
        });

        _Blog.toggleTheme = function () {
            if (isDark) {
                document.getElementsByTagName('body')[0].classList.add('dark-theme');
                // mobile
                document.getElementById("mobile-toggle-theme").innerText = " · Dark";
            } else {
                document.getElementsByTagName('body')[0].classList.remove('dark-theme');
                // mobile
                document.getElementById("mobile-toggle-theme").innerText = " · Light";
            }

            document.getElementsByClassName('toggleBtn')[0].addEventListener('click', () => {
                if (document.getElementsByTagName('body')[0].classList.contains('dark-theme')) {
                    document.getElementsByTagName('body')[0].classList.remove('dark-theme');
                } else {
                    document.getElementsByTagName('body')[0].classList.add('dark-theme');
                }

                window.localStorage &&
                    window.localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
            });

            // moblie
            document.getElementById('mobile-toggle-theme').addEventListener('click', () => {
                if (document.getElementsByTagName('body')[0].classList.contains('dark-theme')) {
                    document.getElementsByTagName('body')[0].classList.remove('dark-theme');
                    // mobile
                    document.getElementById("mobile-toggle-theme").innerText = " · Light";

                } else {
                    document.getElementsByTagName('body')[0].classList.add('dark-theme');
                    // mobile
                    document.getElementById("mobile-toggle-theme").innerText = " · Dark";
                }

                window.localStorage &&
                    window.localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
            });
        };
        _Blog.toggleTheme();
    }
);

function mobileBtn() {
    var toggleMenu = document.getElementsByClassName("menu-toggle")[0];
    var mobileMenu = document.getElementById("mobile-menu");
    if (toggleMenu.classList.contains("active")) {
        toggleMenu.classList.remove("active")
        mobileMenu.classList.remove("active")
    } else {
        toggleMenu.classList.add("active")
        mobileMenu.classList.add("active")
    }
}


function request(url) {
    var ajax = new XMLHttpRequest();
    ajax.onreadystatechange = function () {
        if (ajax.readyState == 4 && ajax.status == 200) {
            return ajax.responseText;
        }
    }
    ajax.open("get", url, false);
    ajax.setRequestHeader("Content-type", "application/json");
    ajax.send();
}

player = null;

var response = request("https://api.meowv.com/fm/channels");
console.log(response);
var response_json = JSON.parse(response);
console.log(response_json);
if (response_json.success) {
    console.table(response_json.result);
}
//if (response.success) {
//    var result = response.result[0];
//    player = new APlayer({
//        container: document.getElementById('aplayer'),
//        fixed: true,
//        autoplay: true,
//        lrcType: 3,
//        audio: [{
//            name: result.title,
//            artist: result.artist,
//            url: result.url,
//            cover: result.picture,
//            lrc: result.lrc
//        }]
//    });
//    player.lrc.hide();
//}