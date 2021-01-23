window.onload = function () {
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

    var paths = ['/posts', '/categories', '/tags', '/apps'];
    var pathname = location.pathname;
    if (pathname == "/") {
        document.querySelector('.weixin').addEventListener('click', () => {
            document.querySelector(".qrcode").classList.contains('hidden') ? document.querySelector(".qrcode").classList.remove('hidden') : document.querySelector(".qrcode").classList.add('hidden');
        });
    } else {
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
};