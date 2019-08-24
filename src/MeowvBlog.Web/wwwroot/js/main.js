api_domain = "https://localhost:44345";
var _mtac = { "performanceMonitor": 1, "senseQuery": 1 };
var result;
share = {
    title: '😍阿星Plus⭐⭐⭐',
    desc: '生命不息，奋斗不止',
    imgUrl: 'https://static.meowv.com/images/logo.jpg'
};
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

function wx_share(arguments) {
    var title = arguments.title || document.title || '';
    var desc = arguments.desc || document.querySelector('meta[name="description"]').getAttribute('content') || '';

    var data = {
        title: title.replace(/[\r\n]/g, "").replace(/'/g, ''),
        desc: desc.replace(/[\r\n]/g, "").replace(/'/g, ''),
        link: arguments.link || window.location.href,
        imgUrl: arguments.imgUrl || ""
    };

    get_wx_sign(data.link);

    wx.config({
        debug: true,
        appId: 'wx58583618fe8363c5',
        timestamp: result.timestamp,
        nonceStr: result.noncestr,
        signature: result.signature,
        jsApiList: ['onMenuShareTimeline', 'onMenuShareAppMessage', 'onMenuShareQQ', 'onMenuShareWeibo']
    });

    wx.ready(function () {
        wx.onMenuShareTimeline({
            title: data.title,
            desc: data.desc,
            link: data.link,
            imgUrl: data.imgUrl,
            success: function () {
                console.log("share success");
            },
            cancel: function () {
                console.log("cancel share");
            }
        });
        wx.onMenuShareAppMessage({
            title: data.title,
            desc: data.desc,
            link: data.link,
            imgUrl: data.imgUrl,
            type: '',
            dataUrl: '',
            success: function () {
                console.log("share success");
            },
            cancel: function () {
                console.log("cancel share");
            }
        });
        wx.onMenuShareQQ({
            title: data.title,
            desc: data.desc,
            link: data.link,
            imgUrl: data.imgUrl,
            success: function () {
                console.log("share success");
            },
            cancel: function () {
                console.log("cancel share");
            }
        });
        wx.onMenuShareWeibo({
            title: data.title,
            desc: data.desc,
            link: data.link,
            imgUrl: data.imgUrl,
            success: function () {
                console.log("share success");
            },
            cancel: function () {
                console.log("cancel share");
            }
        });
    });

    wx.error(function (res) {
        console.log(res);
    });
}

function get_wx_sign(link) {
    var api = `/api/apps/weixin_sign?url=${encodeURIComponent(link)}`;
    http_get(api);
}

function http_get(url) {
    let xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            result = JSON.parse(xhr.responseText);
        }
    };
    xhr.open("get", url, false);
    xhr.send();
}