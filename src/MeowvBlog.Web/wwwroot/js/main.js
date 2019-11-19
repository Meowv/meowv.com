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
        const currentTheme = window.localStorage.getItem('theme');
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

const pathname = location.pathname;
process_page(pathname);

function process_page(pathname) {
    if (pathname == "/") {
        document.querySelector(".weixin").addEventListener("click", function () {
            document.querySelector(".qrcode").classList.contains('hidden') ? document.querySelector(".qrcode").classList.remove('hidden') : document.querySelector(".qrcode").classList.add('hidden');
        });
    } else if (pathname == "/apps") {
        document.querySelector("#change_song_list").addEventListener("click", function () {
            load_audio();
        });
    } else if (pathname == "/bing" || pathname == "/cat" || pathname == "/girl") {
        window.onload = () => document.querySelector('.loader').remove();
        if (pathname == "/girl") {
            document.querySelector(".soul-btn").addEventListener("click", () => document.querySelector(".girl-img img").src = document.querySelector(".girl-img img").src.split("?")[0] + "?t=" + new Date().getTime());
        }
    } else if (pathname == "/hot") {
        axios.get(`${api_domain}/common/hot_news_source`).then(function (response) {
            var html = template("top_tabs_tmpl", { "result": response.data.result });
            document.querySelector('.top-tab ul').innerHTML = html;

            document.querySelector(".top-tab ul li a").classList.add("archive");
            var defaultId = document.querySelector(".top-tab ul li a").attributes["data-id"].value;
            loadContent(defaultId);

            var btn_tabs = document.querySelectorAll('.top-tab ul li a');
            for (var i = 0; i < btn_tabs.length; i++) {
                btn_tabs[i].onclick = function () {
                    document.querySelector('.loader').style.cssText = "display:block";
                    document.querySelector(".top-tab ul li a.archive").classList.remove("archive")
                    this.classList.add("archive");
                    var id = this.attributes["data-id"].value;
                    loadContent(id);
                }
            }
        });

        function loadContent(id) {
            axios.get(`${api_domain}/common/hot_news?sourceId=${id}`).then(function (response) {
                var html = template("top_content_tmpl", response.data);
                document.querySelector('.top-content ul').innerHTML = html;

                document.querySelector('.loader').style.cssText = "display:none";
            });
        }
    } else if (pathname == "/sign") {
        var cdn_domain = "https://static.meowv.com/signature/";

        axios.all([signature_type(), recently_signature_logs()]).then(axios.spread(function (sign_type_response, recently_log_response) {
            var signature_type_html = "";
            sign_type_response.data.result.forEach(x => {
                if (x.value == 901) {
                    signature_type_html += `<option selected="selected" value="${x.value}">${x.description}</option>`;
                } else {
                    signature_type_html += `<option value="${x.value}">${x.description}</option>`;
                }
            });
            var recently_signature_log_html = "";
            recently_log_response.data.result.forEach(x => {
                recently_signature_log_html += `<a href="javascript:;" data-url="${x.url}">${x.name}</a>`;
            });
            document.querySelector("#type").innerHTML = signature_type_html;
            document.querySelector(".tag-cloud-tags-extend").innerHTML = recently_signature_log_html;
            document.querySelector(".signature-box").style.cssText = "display:block";
            document.querySelector(".post-wrap").style.cssText = "display:block";
            document.querySelector('.loader').remove();

            var a_list = document.querySelectorAll('.tag-cloud-tags-extend a');
            for (var i = 0; i < a_list.length; i++) {
                a_list[i].onclick = function () {
                    var url = this.attributes["data-url"].value;
                    document.querySelector(".signature-img img").src = cdn_domain + url;
                }
            }
        }));

        function signature_type() {
            return axios.get(`${api_domain}/signature/type`);
        }
        function recently_signature_logs() {
            return axios.get(`${api_domain}/signature/logs`);
        }

        document.querySelector("#btn_do").addEventListener("click", function () {
            var name = document.querySelector("#name").value.trim();
            if (name.length > 4 || name.length == 0) {
                return false;
            }
            var typeId = document.querySelector("#type").value;

            axios.get(`${api_domain}/signature?name=${name}&id=${typeId}`).then(function (response) {
                document.querySelector(".signature-img img").src = cdn_domain + response.data.result;
            });
        });
    } else if (pathname == "/soul") {
        getSoul();
        function getSoul() {
            axios.get(`${api_domain}/soul`).then(function (response) {
                if (response.data.success) document.querySelector(".soul h1").innerText = response.data.result;
            });
        }
        document.querySelector(".soul-btn").addEventListener("click", () => getSoul());
    } else if (pathname == "/tucao") {
        window.onresize = () => changeFrameHeight();
        window.onload = () => changeFrameHeight();
        function changeFrameHeight() {
            document.getElementById("tucao").height = document.documentElement.clientHeight - 200;
        }
    } else if (pathname == "/analysis") {
        var date = new Date();
        var ymd = date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + (date.getDate() - 1);
        document.querySelectorAll(".mta-date").forEach(x => x.innerText = ymd);

        axios.get(`${api_domain}/mta/ctr_core_data?start_date=${ymd}&end_date=${ymd}&idx=pv,uv,vv,iv`).then(function (response) {
            if (response.data.info = "success") {
                var key = ymd.replace(/-/g, "");
                var result = response.data.data[key];

                document.querySelector("#pv strong").innerText = result.pv;
                document.querySelector("#uv strong").innerText = result.uv;
                document.querySelector("#vv strong").innerText = result.vv;
                document.querySelector("#iv strong").innerText = result.iv;

                document.querySelector(".mta-a ul").style.cssText = "display:block";
                document.querySelector('.loader').remove();
            }
        });
    } else if (pathname == "/friendlinks") {
        axios.get(`${api_domain}/blog/friendlinks`).then(function (response) {
            if (response.data.success) {
                var html = template("friendlinks_tmpl", response.data);
                document.querySelector('.categories-card').innerHTML = html;
                document.querySelector('.loader').remove();
            }
        });
    } else if (pathname == "/posts") {
        var page = location.pathname.replace(/posts|page|\//gi, "") || 1;
        var limit = 15;

        axios.get(`${api_domain}/blog/post/query?page=${page}&limit=${limit}`).then(function (response) {
            if (response.data) {
                if (!response.data.result) {
                    document.querySelector('.post-wrap.archive').innerHTML = `<h2 class="post-title">找了找不到了~~~</h2>`;
                    document.querySelector('.loader').remove();
                    return false;
                }

                var data = { "result": response.data.result };
                var html = template("posts_tmpl", data);
                document.querySelector('.post-wrap.archive').insertAdjacentHTML('afterbegin', html);

                var totalPage = Math.ceil(response.data.total / limit);

                var paginationHtml = "";
                for (var i = 1; i <= totalPage; i++) {
                    paginationHtml += page == i ? `<span class="page-number current">${i}</span>` : `<a class="page-number" href="/posts/page/${i}/">${i}</a>`;
                }
                document.querySelector('.pagination').innerHTML = paginationHtml;

                document.querySelector('.loader').remove();
                document.getElementById('posts_tmpl').remove();
            }
        });
    } else if (pathname.indexOf("/post/") == 0) {
        var url = location.pathname.replace("/post", "");
        url = url.substring(url.length - 1) == "/" ? url : url + "/";

        axios.get(`${api_domain}/blog/post?url=${url}`).then(function (response) {
            if (response.data.success) {
                document.title = document.title.substring(0, 2) + response.data.result.title + " - " + document.title.substring(2);

                var html = template("detail_tmpl", response.data);
                document.querySelector('.post-wrap').innerHTML = html;
            } else {
                document.querySelector('.post-wrap').innerHTML = `<h2 class="post-title">${response.data.message}</h2>`;
            }
            document.querySelector('.loader').remove();
            editormd.markdownToHTML("content");
        });
    } else if (pathname == "/tags") {
        axios.get(`${api_domain}/blog/tags`).then(function (response) {
            if (response.data.success) {
                var html = template("tags_tmpl", response.data);
                document.querySelector('.tag-cloud-tags').innerHTML = html;
                document.querySelector('.loader').remove();
            }
        });
    } else if (pathname.indexOf("/tag/") == 0) {
        var name = location.pathname.replace(/tag|\//gi, "");

        axios.all([getTagName(name), getPostsByTagName(name)]).then(axios.spread(function (tagNameResponse, postsResponse) {
            if (tagNameResponse.data.success) {
                document.title = document.title.substring(0, 2) + tagNameResponse.data.result + " - " + document.title.substring(2);
                var html = template("tagName_tmpl", tagNameResponse.data);
                document.querySelector('.post-title').innerHTML = html;
            } else {
                document.querySelector('.post-title').innerText = tagNameResponse.data.msg;
            }
            if (postsResponse.data.success) {
                var html = template("tag_post_tmpl", postsResponse.data);
                document.querySelector('.post-wrap.archive').innerHTML = html;
                document.querySelector('.loader').remove();
            }
        }));

        function getTagName(name) {
            return axios.get(`${api_domain}/blog/tag?name=${name}`);
        }

        function getPostsByTagName(name) {
            return axios.get(`${api_domain}/blog/post/query_by_tag?name=${name}`);
        }
    } else if (pathname == "/categories") {
        axios.get(`${api_domain}/blog/categories`).then(function (response) {
            if (response.data.success) {
                var html = template("categories_tmpl", response.data);
                document.querySelector('.categories-card').innerHTML = html;
                document.querySelector('.loader').remove();
            }
        });
    } else if (pathname.indexOf("/category/") == 0) {
        var name = location.pathname.replace(/category|\//gi, "");

        axios.all([getCategoryName(name), getPostsByCategoryName(name)]).then(axios.spread(function (categoryNameResponse, postsResponse) {
            if (categoryNameResponse.data.success) {
                document.title = document.title.substring(0, 2) + categoryNameResponse.data.result + " - " + document.title.substring(2);
                var html = template("categoryName_tmpl", categoryNameResponse.data);
                document.querySelector('.post-title').innerHTML = html;
            } else {
                document.querySelector('.post-title').innerText = categoryNameResponse.data.msg;
            }
            if (postsResponse.data.success) {
                var html = template("category_post_tmpl", postsResponse.data);
                document.querySelector('.post-wrap.archive').innerHTML = html;
                document.querySelector('.loader').remove();
            }
        }));

        function getCategoryName(name) {
            return axios.get(`${api_domain}/blog/category?name=${name}`);
        }

        function getPostsByCategoryName(name) {
            return axios.get(`${api_domain}/blog/post/query_by_category?name=${name}`);
        }
    }
}

player = null;
const currentAudio = window.localStorage.getItem('audio');
const audioExpireDate = window.localStorage.getItem('audioExpireDate');
if (currentAudio) {
    if (new Date().getTime() > audioExpireDate) {
        load_audio();
    } else {
        load_player(JSON.parse(currentAudio));
        player.list.switch(window.localStorage.getItem('currentPlayIndex'));
        setTimeout(function () {
            player.seek(window.localStorage.getItem('currentPlayTime'));
            player.play();
        }, 500);
    }
} else {
    load_audio();
}

function load_audio() {
    window.localStorage.removeItem('audio');
    window.localStorage.removeItem('currentPlayIndex');
    window.localStorage.removeItem('currentPlayTime');

    var ajax = new XMLHttpRequest();
    ajax.onreadystatechange = function () {
        if (ajax.readyState == 4 && ajax.status == 200) {
            var response = JSON.parse(ajax.responseText);
            if (response.success) {
                var result = response.result;

                window.localStorage.setItem('audio', JSON.stringify(result));
                window.localStorage.setItem("audioExpireDate", new Date().getTime() + 3600000);

                var audio = [];
                result.forEach(x => {
                    audio.push({
                        name: x.title,
                        artist: x.artist,
                        cover: x.cover,
                        url: x.url,
                        lrc: x.lrc
                    });
                });
                load_player(audio);
            }
        }
    };
    ajax.open("get", api_domain + "/fm/songs", true);
    ajax.setRequestHeader("Content-type", "application/json");
    ajax.send();
}

function load_player(audio) {
    player = new APlayer({
        container: document.getElementById('aplayer'),
        fixed: true,
        lrcType: 3,
        audio: audio
    });
    player.lrc.hide();
}

setInterval(function () {
    if (!player.audio.paused) {
        window.localStorage.setItem('currentPlayIndex', player.list.index);
        window.localStorage.setItem('currentPlayTime', player.audio.currentTime);
    }
}, 1000);

var notify = function (title, body, data) {
    var notification = new Notification(title, {
        body: body,
        icon: "https://static.meowv.com/favicon.ico",
        data: data,
    });

    notification.onclick = function () {
        window.open(notification.data);
    }

    setTimeout(function () { notification.close(); }, 5000);
};

function showNotification(title, body, data) {
    if (!('Notification' in window)) {
        console.log('This browser does not support desktop notification');
    } else if (Notification.permission === 'granted') {
        notify(title, body, data);
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission(function (permission) {
            if (!('permission' in Notification)) {
                Notification.permission = permission;
            }
            if (permission === 'granted') {
                notify(title, body, data);
            }
        });
    }
}

var connection = new signalR.HubConnectionBuilder().withUrl("/connection").build();

connection.on("ReceiveNotification", function (title, message, data) {
    showNotification(title, message, data);
});

connection.start().catch(function (err) {
    return console.error(err.toString());
});

console.log("\n %c 执行 load_audio() 换一批歌单 %c http://meowv.com \n", "color: #fadfa3; background: #030307; padding:5px 0;", "background: #fadfa3; padding:5px 0;");