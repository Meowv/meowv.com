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
    const router = {
        home: "/",
        posts: "/posts",
        post: "/post/",
        categories: "/categories",
        category: "/category/",
        tags: "/tags",
        tag: "/tag/",
        apps: "/apps",
        tucao: "/tucao",
        sign: "/sign",
        hot: "/hot",
        soul: "/soul",
        imgs: ["/girl", "/cat", "/cat/", "/bing"],
        analysis: "/analysis",
        friendlinks: "/friendlinks",
        wallpaper: "/wallpaper"
    }

    if (pathname == router.home) {
        document.querySelector(".weixin").addEventListener("click", function () {
            document.querySelector(".qrcode").classList.contains('hidden') ? document.querySelector(".qrcode").classList.remove('hidden') : document.querySelector(".qrcode").classList.add('hidden');
        });
    } else if (pathname.indexOf(router.apps) == 0) {
        document.querySelector("#change_song_list").addEventListener("click", function () {
            load_audio();
        });
    } else if (router.imgs.indexOf(pathname) >= 0) {
        window.onload = () => document.querySelector('.loader').remove();
        if (pathname == router.imgs[0]) {
            document.querySelector(".soul-btn").addEventListener("click", () => document.querySelector(".girl-img img").src = document.querySelector(".girl-img img").src.split("?")[0] + "?t=" + new Date().getTime());
        }
    } else if (pathname.indexOf(router.hot) == 0) {
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
    } else if (pathname.indexOf(router.sign) == 0) {
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

        var typeId;
        var name;

        var captcha = new TencentCaptcha('2049355346', function (res) {
            if (res.ret === 0) {
                axios.get(`${api_domain}/tca/captcha?ticket=${res.ticket}&randstr=${res.randstr}`).then(function (response) {
                    if (response.data.success) {
                        axios.get(`${api_domain}/signature?name=${name}&id=${typeId}`).then(function (response) {
                            document.querySelector(".signature-img img").src = cdn_domain + response.data.result;
                        });
                    }
                });
            }
        });

        document.querySelector("#btn_do").addEventListener("click", function () {
            typeId = document.querySelector("#type").value;
            name = document.querySelector("#name").value.trim();
            if (name.length > 4 || name.length == 0) {
                return false;
            }
            captcha.show();
        });
    } else if (pathname.indexOf(router.soul) == 0) {
        getSoul();
        function getSoul() {
            axios.get(`${api_domain}/soul`).then(function (response) {
                if (response.data.success) document.querySelector(".soul h1").innerText = response.data.result;
            });
        }
        document.querySelector(".soul-btn").addEventListener("click", () => getSoul());
    } else if (pathname.indexOf(router.tucao) == 0) {
        window.onresize = () => changeFrameHeight();
        window.onload = () => changeFrameHeight();
        function changeFrameHeight() {
            document.getElementById("tucao").height = document.documentElement.clientHeight - 200;
        }
    } else if (pathname.indexOf(router.analysis) == 0) {
        var date = new Date();
        var ymd = date.getFullYear() + "-" + fullData(date.getMonth() + 1) + "-" + fullData(date.getDate() - 1);
        function fullData(number) {
            return number < 10 ? '0' + number : number;
        }
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
    } else if (pathname.indexOf(router.friendlinks) == 0) {
        axios.get(`${api_domain}/blog/friendlinks`).then(function (response) {
            if (response.data.success) {
                var html = template("friendlinks_tmpl", response.data);
                document.querySelector('.categories-card').innerHTML = html;
                document.querySelector('.loader').remove();
            }
        });
    } else if (pathname.indexOf(router.posts) == 0) {
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
    } else if (pathname.indexOf(router.wallpaper) == 0) {
        var _parameter = {
            type: 0,
            page: 1,
            keywords: ''
        }
        var _urldata = {};
        location.search.replace(/([^?&=]+)=([^&]+)/g, (_, k, v) => _urldata[k] = v);

        _parameter.type = _urldata.t || 0;
        _parameter.page = _urldata.p || 1;
        _parameter.keywords = _urldata.k || '';

        loadingWallpaperType();
        loadingWallpaper(_parameter.type, _parameter.page, _parameter.keywords);
        pushState();

        // 加载壁纸分类菜单，并遍历监听点击事件
        function loadingWallpaperType() {
            axios.get(`${api_domain}/wallpaper/types`).then(function (response) {
                var result = response.data.result;
                if (_parameter.type == 0) {
                    result.splice(0, 0, {
                        key: "All",
                        value: 0,
                        description: "全部"
                    });
                }
                var html = template("wallpaper_nav_tmpl", { "result": result });
                document.querySelector('.wallpaper-nav').innerHTML = html;
                document.querySelector(".wallpaper-nav a").classList.add("wallpaper-active");
            }).then(function () {
                var nav_list = document.querySelectorAll(".wallpaper-nav a");
                for (var i = 0; i < nav_list.length; i++) {
                    if (nav_list[i].attributes["data-type"].value == _parameter.type) {
                        settingNavClass(nav_list[i]);
                    }
                    nav_list[i].onclick = function () {
                        document.querySelector('.loader').style.cssText = "display:block";

                        _parameter.type = this.attributes["data-type"].value;
                        _parameter.page = 1;
                        _parameter.keywords = '';
                        settingNavClass(this);
                        loadingWallpaper(_parameter.type, _parameter.page, _parameter.keywords);
                        pushState()
                    }
                }
            });
        }
        // 加载壁纸
        function loadingWallpaper(type, page, keywords) {
            axios.get(`${api_domain}/wallpaper?type=${type}&page=${page}&keywords=${keywords}`).then(function (response) {
                var html = template("wallpaper_tmpl", response.data);
                document.querySelector('.wallpapers').innerHTML = html;

                var totalPage = Math.ceil(response.data.total / 30);
                var paginationHtml = "";
                page = Number(page);
                if (page == 1) {
                    paginationHtml += `<span class="page-number">Previous</span><a class="page-number" href="/wallpaper?t=${type}&k=${keywords}&p=${page + 1}">Next</a>`;
                } else if (page >= totalPage) {
                    paginationHtml += `<a class="page-number" href="/wallpaper?t=${type}&k=${keywords}&p=${page - 1}">Previous</a><span class="page-number">Next</span>`;
                } else {
                    paginationHtml += `<a class="page-number" href="/wallpaper?t=${type}&k=${keywords}&p=${page - 1}">Previous</a><a class="page-number" href="/wallpaper?t=${type}&k=${keywords}&p=${page + 1} ">Next</a>`;
                }
                document.querySelector('.pagination').innerHTML = paginationHtml;

                document.querySelector('.loader').style.cssText = "display:none";
            }).then(function () {
                wallpaperClick();
            });
        }
        // 设置a标签选中样式
        function settingNavClass(item) {
            document.querySelectorAll(".wallpaper-nav a").forEach(x => {
                x.classList.remove("wallpaper-active");
            });
            item.classList.add("wallpaper-active");
        }
        // 不刷新页面动态设置查询参数
        function pushState() {
            history.pushState(null, null, location.href.split("?")[0] + "?t=" + _parameter.type + "&k=" + _parameter.keywords + "&p=" + _parameter.page);
        }
        // 壁纸图片点击事件监听
        function wallpaperClick() {
            var imgs = document.querySelectorAll(".wallpaper img");
            for (var i = 0; i < imgs.length; i++) {
                imgs[i].onclick = function () {
                    fetch(this.src.replace("middle", "max")).then(res => res.blob().then(blob => {
                        window.open(window.URL.createObjectURL(blob), "_blank");
                    }));
                }
            }
        }
        // 禁止右键
        document.body.oncontextmenu = function () {
            self.event.returnValue = false;
        };
        document.onkeydown = function () {
            // 禁止 ctrl + U
            if (event.ctrlKey && window.event.keyCode == 85) {
                return false;
            }
            // 禁止 ctrl + shift + I
            if (event.ctrlKey && event.shiftKey && window.event.keyCode == 73) {
                return false;
            }
            //禁止 F12
            if (window.event && window.event.keyCode == 123) {
                event.keyCode = 0;
                event.returnValue = false;
            }
        }
    } else if (pathname.indexOf(router.post) == 0) {
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
    } else if (pathname.indexOf(router.tags) == 0) {
        axios.get(`${api_domain}/blog/tags`).then(function (response) {
            if (response.data.success) {
                var html = template("tags_tmpl", response.data);
                document.querySelector('.tag-cloud-tags').innerHTML = html;
                document.querySelector('.loader').remove();
            }
        });
    } else if (pathname.indexOf(router.tag) == 0) {
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
    } else if (pathname.indexOf(router.categories) == 0) {
        axios.get(`${api_domain}/blog/categories`).then(function (response) {
            if (response.data.success) {
                var html = template("categories_tmpl", response.data);
                document.querySelector('.categories-card').innerHTML = html;
                document.querySelector('.loader').remove();
            }
        });
    } else if (pathname.indexOf(router.category) == 0) {
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
        autoplay: false,
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