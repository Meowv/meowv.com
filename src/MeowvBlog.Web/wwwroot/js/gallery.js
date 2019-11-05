axios.get(`https://api.meowv.com/gallery`)
    .then(function (response) {
        if (response.data.success) {
            var html = template("gallery_tmpl", response.data);
            document.querySelector('.container').innerHTML = html;
        }
    }).then(function () {
        document.getElementsByClassName = function (className, tag, elm) {
            var testClass = new RegExp("(^|\s)" + className + "(\s|$)");
            var tag = tag || "*";
            var elm = elm || document;
            var elements = (tag == "*" && elm.all) ? elm.all : elm.getElementsByTagName(tag);
            var returnElements = [];
            var current;
            var length = elements.length;
            for (var i = 0; i < length; i++) {
                current = elements[i];
                if (testClass.test(current.className)) {
                    returnElements.push(current);
                }
            }
            return returnElements;
        }

        var con = document.getElementsByClassName('container');
        var margin = 10;
        var boxes = document.getElementsByClassName('albums');
        var boxWidth = boxes[0].offsetWidth + margin;

        var show = function () {
            var columnHeight = [];
            var bodyWidth = document.body.offsetWidth;
            var n = parseInt(bodyWidth / boxWidth);
            var columnNum = n == 0 ? 1 : n;
            var bodyLeft = bodyWidth >= boxWidth ? bodyWidth - columnNum * boxWidth : 0;
            con[0].style.left = parseInt(bodyLeft / 2) - margin / 2 + 'px';
            for (var i = 0, l = boxes.length; i < l; i++) {
                if (i < columnNum) {
                    columnHeight[i] = boxes[i].offsetHeight + margin;
                    boxes[i].style.top = 0;
                    boxes[i].style.left = i * boxWidth + margin + 'px';
                } else {
                    var innsertColumn = min(columnHeight),
                        imgHeight = boxes[i].offsetHeight + margin;
                    boxes[i].style.top = columnHeight[innsertColumn] + 'px';
                    boxes[i].style.left = innsertColumn * boxWidth + margin + 'px';
                    columnHeight[innsertColumn] += imgHeight;
                };
            };
        }

        var min = function (heightAarry) {
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

        window.onload = function () { show(); };
        window.onresize = function () { show(); };
        setTimeout(show(), 500);

        document.querySelectorAll('.albums').forEach(x => {
            x.onclick = function () {
                const images = [];
                var id = this.attributes["data-id"].value;
                axios.get(`https://api.meowv.com/gallery/images?id=${id}`)
                    .then(function (response) {
                        if (response.data.success) {
                            response.data.result.forEach(x => {
                                images.push({
                                    src: x.imgUrl,
                                    w: x.width,
                                    h: x.height
                                });
                                loadImageAsync(x.imgUrl);
                            });
                        }
                    }).then(function () {
                        var gallery = new PhotoSwipe(document.querySelector('.pswp'), PhotoSwipeUI_Default, images, {
                            history: false,
                            focus: false,
                            showAnimationDuration: 0,
                            hideAnimationDuration: 0
                        });
                        gallery.init();
                    }).catch(function (error) {
                        console.log(error);
                    });
            };
        });

        var loadImageAsync = function (url) {
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

    }).catch(function (error) {
        console.log(error);
    });