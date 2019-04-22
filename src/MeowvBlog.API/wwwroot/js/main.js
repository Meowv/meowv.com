$(document).ready(function() {
	$(window).resize();
});
$(window).resize(function() {
	var bodyHeight = $(document.body).height();
	var winHeight = $(window).height();
	if (bodyHeight <= winHeight) {
		$('.vc-footer').addClass('vc-fixed');
	} else {
		$('.vc-footer').removeClass('vc-fixed');
	}
});