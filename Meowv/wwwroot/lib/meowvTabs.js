;
(function (window) {

    'use strict';

    function extend(a, b) {
        for (var key in b) {
            if (b.hasOwnProperty(key)) {
                a[key] = b[key];
            }
        }
        return a;
    }

    class meowvTabs {
        constructor(el, options) {
            this.el = el;
            this.options = extend({}, this.options);
            extend(this.options, options);
            this._init();
        }
        _init() {
            // tabs elems
            this.tabs = [].slice.call(this.el.querySelectorAll('nav > ul > li'));
            // content items
            this.items = [].slice.call(this.el.querySelectorAll('.content-wrap > section'));
            // current index
            this.current = -1;
            // show current content item
            this._show();
            // init events
            this._initEvents();
        }
        _initEvents() {
            var self = this;
            this.tabs.forEach(function (tab, idx) {
                tab.addEventListener('click', function (ev) {
                    ev.preventDefault();
                    self._show(idx);
                });
            });
        }
        _show(idx) {
            if (this.current >= 0) {
                this.tabs[this.current].className = this.items[this.current].className = '';
            }
            // change current
            this.current = idx != undefined ? idx : this.options.start >= 0 && this.options.start < this.items.length ?
                this.options.start : 0;
            this.tabs[this.current].className = 'tab-current';
            this.items[this.current].className = 'content-current';
        }
    }

    meowvTabs.prototype.options = {
        start: 0
    };

    // add to global namespace
    window.meowvTabs = meowvTabs;

})(window);