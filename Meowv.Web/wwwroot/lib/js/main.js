(function ($) {
    $(".article-entry").each(function (i) {
        $(this).find("img").each(function () {
            if ($(this).parent().hasClass("fancybox")) return;
            var alt = this.alt;
            if (alt) {
                $(this).after('<span class="caption">' + alt + "</span>")
            }
            $(this).wrap('<a href="' + this.src + '" data-fancybox="gallery" data-caption="' + alt + '"></a>');
        });
    });
    if ($.fancybox) {
        $(".fancybox").fancybox()
    }
})(jQuery);