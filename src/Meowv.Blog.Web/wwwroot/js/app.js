window.onload = function () {
    const api = "https://localhost:5001";
    const cdn = "https://172.24.96.1:8001";

    const currentTheme = window.localStorage.getItem('theme');
    const isDark = currentTheme === 'dark';

    if (isDark) {
        document.querySelector('body').classList.add('dark-theme');
        document.getElementById('switch_default').checked = true;
        document.getElementById('mobile-toggle-theme').innerText = ' · Dark';
    } else {
        document.querySelector('body').classList.remove('dark-theme');
        document.getElementById('switch_default').checked = false;
        document.getElementById('mobile-toggle-theme').innerText = ' · Light';
    }

    const pathname = location.pathname;
    if (pathname == "/") {
        document.querySelector('.weixin').addEventListener('click', () => {
            document.querySelector(".qrcode").classList.contains('hidden') ? document.querySelector('.qrcode').classList.remove('hidden') : document.querySelector('.qrcode').classList.add('hidden');
        });
    } else if (pathname == "/signature") {
        document.getElementById('btn_signture').addEventListener('click', () => {
            var name = document.getElementById('name').value.trim();
            var data = {
                typeId: document.getElementById('type').value,
                name: name
            }
            if (name.length > 4 || name.length == 0) return false;
            fetch(`${api}/api/meowv/signature/generate`, {
                "method": "POST",
                "headers": {
                    "content-type": "application/json; charset=utf-8"
                },
                "body": JSON.stringify(data)
            }).then(async response => {
                var json = await response.json();
                document.querySelector('.signature-img img').src = `${cdn}/${json.result}`;
            });
        });
    } else {
        var paths = ['/posts', '/categories', '/tags', '/apps'];
        if (paths.includes(pathname)) {
            document.querySelector(`.menu .menu-item[href='${location.pathname}']`).classList.add('active');
        }
    }

    document.querySelector('.toggleBtn').addEventListener('click', () => {
        if (document.querySelector('body').classList.contains('dark-theme')) {
            document.querySelector('body').classList.remove('dark-theme');
        } else {
            document.querySelector('body').classList.add('dark-theme');
        }

        window.localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
    });

    document.getElementById('mobile-toggle-theme').addEventListener('click', () => {
        if (document.querySelector('body').classList.contains('dark-theme')) {
            document.querySelector('body').classList.remove('dark-theme');
            document.getElementById('mobile-toggle-theme').innerText = ' · Light';
        } else {
            document.querySelector('body').classList.add('dark-theme');
            document.getElementById('mobile-toggle-theme').innerText = ' · Dark';
        }

        window.localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
    });

    document.querySelector('.menu-toggle').addEventListener('click', () => {
        var toggleMenu = document.querySelector('.menu-toggle');
        var mobileMenu = document.getElementById('mobile-menu');
        if (toggleMenu.classList.contains('active')) {
            toggleMenu.classList.remove('active');
            mobileMenu.classList.remove('active');
        } else {
            toggleMenu.classList.add("active");
            mobileMenu.classList.add("active");
        }
    });

    const models = [
        '/live2d/live2d-widget-model-epsilon2_1/assets/Epsilon2.1.model.json',
        '/live2d/live2d-widget-model-haru/01/assets/haru01.model.json',
        '/live2d/live2d-widget-model-haru/02/assets/haru02.model.json',
        '/live2d/live2d-widget-model-haruto/assets/haruto.model.json',
        '/live2d/live2d-widget-model-koharu/assets/koharu.model.json',
        '/live2d/live2d-widget-model-hijiki/assets/hijiki.model.json',
        '/live2d/live2d-widget-model-tororo/assets/tororo.model.json',
        '/live2d/live2d-widget-model-izumi/assets/izumi.model.json',
        '/live2d/live2d-widget-model-miku/assets/miku.model.json',
        '/live2d/live2d-widget-model-shizuku/assets/shizuku.model.json',
        '/live2d/live2d-widget-model-wanko/assets/wanko.model.json',
        '/live2d/live2d-widget-model-z16/assets/z16.model.json'
    ];
    L2Dwidget.init({
        "model": {
            jsonPath: models[parseInt(Math.random() * (models.length))]
        },
        "display": {
            "position": "right",
            "width": 150,
            "height": 210,
            "hOffset": 5,
            "vOffset": 5,
            "superSample": 1,
        },
        "mobile": {
            "scale": 1,
            "show": true,
            "motion": true,
        },
        "react": {
            "opacityDefault": .5,
            "opacityOnHover": .2
        }
    });
};