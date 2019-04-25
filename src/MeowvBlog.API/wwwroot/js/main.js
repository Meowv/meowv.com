$(function () {
    showScroll();
    function showScroll() {
        $(window).scroll(function () {
            var scrollValue = $(window).scrollTop();
            scrollValue > 100 ? $('div[class=backtop]').fadeIn() : $('div[class=backtop]').fadeOut();
        });
        $('div[class=backtop]').click(function () {
            $("html,body").animate({ scrollTop: 0 }, 200);
        });
    }
});