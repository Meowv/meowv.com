const api_domain = "https://api.meowv.com";
var con = document.getElementsByClassName('container');
var margin = 10;
var boxes;
var boxWidth;

axios.get(`${api_domain}/gallery`)
    .then(function (response) {
        if (response.data.success) {
            var html = template("gallery_tmpl", response.data);
            document.querySelector('.container').innerHTML = html;
            document.querySelector('.loader').remove();
        }
    }).then(function () {
        boxes = document.getElementsByClassName('albums');
        boxWidth = boxes[0].offsetWidth + margin;

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

        window.onload = function () { show(); };
        window.onresize = function () { show(); };

        document.querySelectorAll('.albums').forEach(x => {
            x.onclick = function () {
                const images = [];
                var id = this.attributes["data-id"].value;
                axios.get(`${api_domain}/gallery/images?id=${id}`)
                    .then(function (response) {
                        if (response.data.success) {
                            response.data.result.forEach(x => {
                                images.push({
                                    src: 'https://static.meowv.com/gallery/images/' + x.imgUrl,
                                    w: x.width,
                                    h: x.height
                                });
                            });
                        }
                    }).then(function () {
                        console.log(images);
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
    }).catch(function (error) {
        console.log(error);
    });

function show() {
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
};

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
