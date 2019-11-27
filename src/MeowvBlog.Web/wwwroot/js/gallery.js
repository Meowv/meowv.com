var margin = 8;
function min(heightAarry) {
    var minColumn = 0;
    var minHeight = heightAarry[minColumn];
    for (var i = 1, len = heightAarry.length; i < len; i++) {
        var temp = heightAarry[i];
        if (temp < minHeight) {
            minColumn = i;
            minHeight = temp;
        };
    };
    return minColumn;
}
function show(albums, albumsWidth) {
    var columnHeight = [];
    var bodyWidth = document.body.offsetWidth;
    var n = parseInt(bodyWidth / albumsWidth);
    var columnNum = n == 0 ? 1 : n;
    var bodyLeft = bodyWidth >= albumsWidth ? bodyWidth - columnNum * albumsWidth : 0;
    document.querySelector('.container').style.left = parseInt(bodyLeft / 2) - margin / 2 + 'px';
    for (var i = 0, l = albums.length; i < l; i++) {
        if (i < columnNum) {
            columnHeight[i] = albums[i].offsetHeight + margin;
            albums[i].style.top = 0;
            albums[i].style.left = i * albumsWidth + margin + 'px';
        } else {
            var innsertColumn = min(columnHeight),
                imgHeight = albums[i].offsetHeight + margin;
            albums[i].style.top = columnHeight[innsertColumn] + 'px';
            albums[i].style.left = innsertColumn * albumsWidth + margin + 'px';
            columnHeight[innsertColumn] += imgHeight;
        };
    };
}
function loadImageAsync (url) {
    return new Promise(function (resolve, reject) {
        var image = new Image();
        image.src = url;

        image.onload = function () {
            var obj = {
                url: url,
                width: image.width,
                height: image.height
            }
            resolve(obj);
        };
        image.onerror = function () {
            reject(new Error('Could not load image at ' + url));
        };
    });
}

axios.get('https://api.meowv.com/gallery').then(function (response) {
    if (response.data.success) {
        var html = template("gallery_tmpl", response.data);
        document.querySelector('.container').innerHTML = html;

        var albums = document.querySelectorAll('.albums');
        var albumsWidth = albums[0].offsetWidth + margin;

        show(albums, albumsWidth);

        window.onload = function () {
            show(albums, albumsWidth);
        };
        window.onresize = function () {
            show(albums, albumsWidth);
        };

        albums.forEach(x => {
            x.onclick = function () {
                const images = [];
                var id = this.attributes["data-id"].value;
                var password = "";
                if (this.attributes["data-isPublic"].value == 'false') password = prompt("请输入相册访问口令", "");
                if (password != null && password != "") {
                    axios.get(`https://api.meowv.com/gallery/images?id=${id}&password=${password}`).then(function (response) {
                        if (response.data.success) {
                            response.data.result.forEach(x => {
                                images.push({
                                    src: x.imgUrl,
                                    w: x.width,
                                    h: x.height
                                });
                                loadImageAsync(x.imgUrl);
                            });
                            var gallery = new PhotoSwipe(document.querySelector('.pswp'), PhotoSwipeUI_Default, images, {
                                history: false,
                                focus: false,
                                showAnimationDuration: 0,
                                hideAnimationDuration: 0
                            });
                            gallery.init();
                        } else {
                            alert(response.data.msg);
                        }
                    });
                }
            };
        });
    }
});