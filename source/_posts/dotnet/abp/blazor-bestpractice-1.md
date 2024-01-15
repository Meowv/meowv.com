---
title: Blazor 实战系列（一）
author: 阿星𝑷𝒍𝒖𝒔
date: 2020-06-09 09:09:09
categories: Blazor
tags:
  - .NET Core
  - abp vNext
  - Blazor
---

## 前言

从今天开始将使用 Blazor 完成博客的前端开发，如果你不了解 [Blazor](https://blazor.net/) ，建议你还是去微软官网学习学习基础知识。本篇不做普及，因为这是实战系列，重点是完成项目开发。

还有，在开始 Blazor 实战之前，建议动手完成之前的系列文章，这样更有连贯性，不至于懵圈。

因为我也是第一次使用 Blazor 开发项目，所以无法保证代码的最优性，如果有不对的地方，或者有更好的做法，欢迎大家指正，谢谢。

接下来，我将现学现做带来一个完整的博客项目，来吧，Just do it 。

我这里选择的是 Blazor WebAssembly，需要你有 .NET Core 3.1 的开发环境，并且你还要有 Visual Studio 2019 IDE。

给大家看看我的开发环境，终端工具是：Window Terminal ，配置一下用起来太爽了，五星强烈推荐。

![ ](/images/abp/blazor-bestpractice-1-01.png)

## 搭建

> Blazor WebAssembly 是一个单页应用框架，可用它通过 .NET 生成交互式客户端 Web 应用。 Blazor WebAssembly 使用开放的 Web 标准（没有插件或代码转换），适用于移动浏览器等各种新式 Web 浏览器。
> ...

不啰嗦了，直接开干吧，在项目中新建 Blazor Web 应用。

![ ](/images/abp/blazor-bestpractice-1-02.png)

然后将项目设置为启动项目，Ctrl+F5 运行一下看看，官网默认示例我这里也懒得说了，直接进入主题吧。

## 改造

我这里使用的 UI 还是我目前博客的样式，你可以选择任意你喜欢的 UI 界面，这部分就随意了，不是本实战系列的重点，所以有关样式这些东西我就直接 Ctrl CV 了。

替换下面 css 代码到 wwwroot/css/app.css 中。

::: details 点击查看代码

```css
*,
*:after,
*:before {
  -webkit-box-sizing: border-box;
  -moz-box-sizing: border-box;
  box-sizing: border-box;
}
html {
  line-height: 1.15;
  -webkit-text-size-adjust: 100%;
}
body {
  margin: 0;
}
h1 {
  font-size: 2em;
  margin: 0.67em 0;
}
hr {
  box-sizing: content-box;
  height: 0;
  overflow: visible;
}
pre {
  font-family: monospace, monospace;
  font-size: 1em;
}
a {
  background-color: transparent;
}
abbr[title] {
  border-bottom: none;
  text-decoration: underline;
  text-decoration: underline dotted;
}
b,
strong {
  font-weight: bolder;
}
code,
kbd,
samp {
  font-family: monospace, monospace;
  font-size: 1em;
}
small {
  font-size: 80%;
}
sub,
sup {
  font-size: 75%;
  line-height: 0;
  position: relative;
  vertical-align: baseline;
}
sub {
  bottom: -0.25em;
}
sup {
  top: -0.5em;
}
img {
  border-style: none;
}
button,
input,
optgroup,
select,
textarea {
  font-family: inherit;
  font-size: 100%;
  line-height: 1.15;
  margin: 0;
}
button,
input {
  overflow: visible;
}
button,
select {
  text-transform: none;
}
button,
[type="button"],
[type="reset"],
[type="submit"] {
  -webkit-appearance: button;
}
button::-moz-focus-inner,
[type="button"]::-moz-focus-inner,
[type="reset"]::-moz-focus-inner,
[type="submit"]::-moz-focus-inner {
  border-style: none;
  padding: 0;
}
button:-moz-focusring,
[type="button"]-moz-focusring,
[type="reset"]-moz-focusring,
[type="submit"]-moz-focusring {
  outline: 1px dotted ButtonText;
}
fieldset {
  padding: 0.35em 0.75em 0.625em;
}
legend {
  box-sizing: border-box;
  color: inherit;
  display: table;
  max-width: 100%;
  padding: 0;
  white-space: normal;
}
progress {
  vertical-align: baseline;
}
textarea {
  overflow: auto;
}
[type="checkbox"],
[type="radio"] {
  box-sizing: border-box;
  padding: 0;
}
[type="number"]::-webkit-inner-spin-button,
[type="number"]::-webkit-outer-spin-button {
  height: auto;
}
[type="search"] {
  -webkit-appearance: textfield;
  outline-offset: -2px;
}
[type="search"]::-webkit-search-decoration {
  -webkit-appearance: none;
}
::-webkit-file-upload-button {
  -webkit-appearance: button;
  font: inherit;
}
details {
  display: block;
}
summary {
  display: list-item;
}
template {
  display: none;
}
[hidden] {
  display: none;
}
@font-face {
  font-family: "Fira Code Medium";
  src: url("https://static.meowv.com/fonts/FiraCode-Medium.woff2") format("woff2"),
    url("https://static.meowv.com/fonts/FiraCode-Medium.woff") format("woff");
  font-weight: 500;
  font-style: normal;
}
html {
  font-family: "Fira Code Medium", Microsoft Yahei, monospace;
  overflow-x: hidden;
}
html::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
html::-webkit-scrollbar-thumb {
  height: 20px;
  background-color: #5a9600;
}
html::-webkit-scrollbar-thumb:hover {
  background-color: #5a9600;
}
body {
  font-size: 11pt;
  font-weight: normal;
  line-height: 2em;
  background-color: #fff;
  color: #161209;
  transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease, opacity
      0.2s ease;
}
body:before {
  content: "";
  background-repeat: no-repeat;
  background-position: center;
  opacity: 0.05;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
}
body.dark-theme {
  background-color: #292a2d;
  color: #a9a9b3;
  transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease, opacity
      0.2s ease;
}
a {
  color: #161209;
  text-decoration: none;
  transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease, opacity
      0.2s ease;
  cursor: pointer;
}
a:hover {
  color: #5a9600;
  text-decoration: none;
  transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease, opacity
      0.2s ease;
}
.dark-theme a {
  color: #a9a9b3;
  text-decoration: none;
  transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease, opacity
      0.2s ease;
}
.dark-theme a:hover {
  color: #fff;
  text-decoration: none;
  transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease, opacity
      0.2s ease;
}
.wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  width: 100%;
}
.navbar {
  height: 4rem;
  line-height: 4rem;
  width: 100%;
}
.navbar .container {
  width: auto;
  max-width: 1200px;
  text-align: center;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
}
.main {
  flex-grow: 1;
  flex-shrink: 0;
  flex-basis: auto;
}
.container {
  padding-left: 1em;
  padding-right: 1em;
}
.footer {
  width: 100%;
  text-align: center;
}
/*input css begin*/
* {
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
}
input[type="checkbox"],
input[type="radio"] {
  display: none;
  width: 0;
  height: 0;
  visibility: hidden;
}
input[type="checkbox"]:checked + label:after {
  transition: all 0.3s ease-in;
}
input[type="checkbox"]:not(:checked) + label:after {
  transition: all 0.3s ease-out;
}
input[type="checkbox"]:checked + label,
input[type="checkbox"]:not(:checked) + label {
  transition: all 0.3s ease-in-out;
}
input[type="checkbox"]:checked + label:before,
input[type="checkbox"]:checked + label i:before,
input[type="checkbox"]:not(:checked) + label i:before,
input[type="checkbox"]:checked + label i:after,
input[type="checkbox"]:not(:checked) + label i:after,
input[type="checkbox"]:not(:checked) + label:before {
  transition: all 0.3s ease-in-out;
}
input[type="radio"]:checked + label:after,
input[type="radio"]:not(:checked) + label:after {
  transition: all 0.3s ease-in-out;
}
.switch_default + label {
  background-color: #e6e6e6;
  border-radius: 7px;
  cursor: pointer;
  display: inline-block;
  height: 14px;
  position: relative;
  box-shadow: 0.2px 0.2px 1px 0.5px rgb(180, 180, 180);
  width: 30px;
}
.switch_default + label:after {
  background-color: #fff;
  border-radius: 50%;
  content: "";
  height: 12px;
  left: 1px;
  position: absolute;
  top: 0.5px;
  width: 12px;
  box-shadow: 0.2px 0.2px 1px 0.5px rgb(180, 180, 180);
}
.switch_default:checked + label {
  background-color: #1abc9c;
  box-shadow: none;
}
.switch_default:checked + label:after {
  left: 17px;
}
@font-face {
  font-family: "iconfont";
  src: url("//at.alicdn.com/t/font_1313145_r9szngeugmj.eot?t=1566619028667");
  /* IE9 */
  src: url("//at.alicdn.com/t/font_1313145_r9szngeugmj.eot?t=1566619028667#iefix")
      format("embedded-opentype"), /* IE6-IE8 */
      url("data:application/x-font-woff2;charset=utf-8;base64,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")
      format("woff2"),
    url("//at.alicdn.com/t/font_1313145_r9szngeugmj.woff?t=1566619028667")
      format("woff"), url("//at.alicdn.com/t/font_1313145_r9szngeugmj.ttf?t=1566619028667")
      format("truetype"),
    /* chrome, firefox, opera, Safari, Android, iOS 4.2+ */
      url("//at.alicdn.com/t/font_1313145_r9szngeugmj.svg?t=1566619028667#iconfont")
      format("svg");
  /* iOS 4.1- */
}
.iconfont {
  font-family: "iconfont" !important;
  font-size: 16px;
  font-style: normal;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.iconread:before {
  content: "\e742";
}
.iconweixin:before {
  content: "\e632";
}
.iconmanage:before {
  content: "\e610";
}
.iconapi:before {
  content: "\e668";
}
.iconcode:before {
  content: "\e654";
}
.icongithub:before {
  content: "\ea0a";
}
.iconnotes:before {
  content: "\e687";
}
.header-logo a {
  padding: 0;
}
.navbar .menu a {
  padding: 0 8px;
}
.navbar .menu .active {
  font-weight: 900;
  color: #161209;
}
.dark-theme .navbar .menu .active {
  color: #fff;
}
.navbar-header a:hover,
.navbar .menu a:hover {
  background-color: transparent;
}
header label {
  margin-left: 15px;
  position: relative;
  -webkit-transform: translateY(0.1em) translateX(0.5em);
}
.copyright {
  font-size: 14px;
}
.pagination {
  display: flex;
  flex-direction: row;
  justify-content: center;
  list-style: none;
  white-space: nowrap;
  width: 100%;
  padding-top: 2em;
}
.pagination a,
.pagination span {
  -webkit-font-smoothing: antialiased;
  font-size: 12px;
  color: #bfbfbf;
  letter-spacing: 0.1em;
  font-weight: 700;
  padding: 5px 5px;
  text-decoration: none;
  transition: 0.3s;
}
.pagination .page-number {
  padding-bottom: 3px;
  margin: 0 20px;
  box-sizing: border-box;
  position: relative;
  display: inline;
}
.pagination .page-number.disabled {
  display: none;
}
.pagination .page-number:hover a {
  color: #000;
}
.dark-theme .pagination .page-number:hover a {
  color: #fff;
}
.pagination .page-number:before,
.pagination .page-number:after {
  position: absolute;
  content: "";
  width: 0;
  height: 1px;
  background: #000;
  transition: 0.3s;
  bottom: 0px;
}
.dark-theme .pagination .page-number:before,
.dark-theme .pagination .page-number:after {
  background: #fff;
}
.pagination .page-number:before .current,
.pagination .page-number:after .current {
  width: 100%;
}
.pagination .page-number:before {
  left: 50%;
}
.pagination .page-number:after {
  right: 50%;
}
.pagination .page-number:hover:before,
.pagination .page-number:hover:after {
  width: 50%;
}
.pagination .page-number.current {
  color: #000;
}
.dark-theme .pagination .page-number.current {
  color: #fff;
}
.pagination .page-number.current:before,
.pagination .page-number.current:after {
  width: 60%;
}
.intro {
  transform: translateY(20vh);
  text-align: center;
}
.intro .avatar {
  padding: 10px;
}
.intro .avatar img {
  width: 128px;
  height: auto;
  display: inline-block;
  -webkit-border-radius: 100%;
  border-radius: 100%;
  -webkit-box-shadow: 0 0 0 0.3618em rgba(0, 0, 0, 0.05);
  box-shadow: 0 0 0 0.3618em rgba(0, 0, 0, 0.05);
  margin: 0 auto;
  -webkit-transition: all ease 0.4s;
  -moz-transition: all ease 0.4s;
  -o-transition: all ease 0.4s;
  transition: all ease 0.4s;
  cursor: pointer;
}
.intro .avatar img:hover {
  position: relative;
  -webkit-transform: translateY(-0.75em);
  -moz-transform: translateY(-0.75em);
  -ms-transform: translateY(-0.75em);
  -o-transform: translateY(-0.75em);
  transform: translateY(-0.75em);
  cursor: pointer;
}
.nickname {
  font-size: 2em;
  font-weight: normal;
}
.links a {
  padding: 0 5px;
}
.links a:hover {
  background-color: transparent;
}
.links .iconfont {
  font-size: 2em;
}
.post-wrap {
  position: relative;
  width: 100%;
  max-width: 1024px;
  margin: 0 auto;
  padding-top: 2rem;
}
.archive-item-date {
  float: right;
  text-align: right;
  color: #a9a9b3;
}
.dark-theme .archive-item-date {
  color: #87878d;
}
.post-wrap .categories-card {
  margin: 0 auto;
  margin-top: 1em;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-direction: row;
  flex-wrap: wrap;
  padding: 0 2.5em;
  line-height: 1.6em;
}
.post-wrap .categories-card .card-item {
  font-size: 14px;
  text-align: left;
  width: 50%;
  display: flex;
  align-items: flex-start;
  position: relative;
}
.post-wrap .categories-card .card-item .categories {
  overflow: hidden;
}
.categories h3 {
  display: inline-block;
}
.categories span {
  float: right;
  padding-right: 1em;
}
.categories .more-post-link {
  float: right;
}
.tag-cloud-tags {
  margin: 10px 0;
  padding-top: 2em;
}
.tag-cloud-tags a {
  display: inline-block;
  position: relative;
  margin: 5px 10px;
  word-wrap: break-word;
  transition-duration: 0.3s;
  transition-property: transform;
  transition-timing-function: ease-out;
}
.tag-cloud-tags a:active,
.tag-cloud-tags a:focus,
.tag-cloud-tags a:hover {
  color: #5a9600;
  transform: scale(1.1);
}
.dark-theme .tag-cloud-tags a:active,
.dark-theme .tag-cloud-tags a:focus,
.dark-theme .tag-cloud-tags a:hover {
  color: #fff;
}
.tag-cloud-tags a small {
  margin: 0 0.3em;
  color: #a9a9b3;
}
.dark-theme .tag-cloud-tags a small {
  color: #fff;
}
.page {
  padding-top: 0;
}
.page .post-content {
  margin: 0;
  padding-top: 0;
}
.post-wrap p {
  font-size: 1em;
  margin: 0.5em 0 0.5em 0;
}
.post-wrap .post-header h1 {
  margin: 0 !important;
}
.post-wrap .post-title {
  font-size: 2em;
  line-height: 1.5em;
}
.post-wrap .eror-tip {
  text-align: center;
  line-height: 1.5em;
  margin-top: 250px;
}
.post-wrap .post-meta {
  color: rgba(85, 85, 85, 0.529) !important;
}
.dark-theme .post-wrap .post-meta {
  color: #87878d !important;
}
.post-wrap .post-meta a {
  color: #000;
}
.dark-theme .post-wrap .post-meta a {
  color: #eee;
}
.post-wrap .post-meta a:hover {
  color: #5a9600;
}
.dark-theme .post-wrap .post-meta a:hover {
  color: #fff;
}
.post-content {
  padding-top: 2rem;
  text-align: justify;
}
.post-copyright {
  margin-top: 5rem;
  border-top: 1px solid #e8e8e8;
  border-bottom: 1px solid #e8e8e8;
}
.post-copyright a {
  color: #000;
}
.dark-theme .post-copyright a {
  color: #eee;
}
.post-copyright a:hover {
  color: #5a9600;
}
.dark-theme .post-copyright a:hover {
  color: #fff;
}
.post-copyright .copyright-item {
  margin: 5px 0;
}
.post-copyright .lincese {
  font-weight: bold;
}
.dark-theme .post-copyright {
  border-top: 1px solid #909196;
  border-bottom: 1px solid #909196;
}
.post-tags {
  padding: 1rem 0 1rem;
  display: flex;
  justify-content: space-between;
}
.post-nav:before,
.post-nav:after {
  content: " ";
  display: table;
}
.post-nav a.prev,
.post-nav a.next {
  font-weight: 600;
  font-size: 16px;
  transition-property: transform;
  transition-timing-function: ease-out;
  transition-duration: 0.3s;
}
.post-nav a.prev {
  float: left;
}
.post-nav a.prev::before {
  content: "<";
  margin-right: 0.5em;
}
.post-nav a.prev:hover {
  transform: translateX(-4px);
}
.post-nav a.next {
  float: right;
}
.post-nav a.next::after {
  content: ">";
  margin-left: 0.5em;
}
.post-nav a.next:hover {
  transform: translateX(4px);
}
.post-nav a.prev::before,
.post-nav a.next::after {
  font-weight: bold;
}
.tag:not(:last-child) a::after {
  content: " / ";
}
@media only screen and (min-device-width: 320px) and (max-device-width: 1024px) {
  .main {
    padding-top: 40pt;
  }
  .navbar {
    display: none;
  }
  .navbar-mobile {
    display: block !important;
    position: fixed;
    width: 100%;
    z-index: 100;
    transition: all 0.6s ease 0s;
  }
  .navbar-mobile .container {
    padding: 0;
    margin: 0;
    line-height: 5.5em;
    background: #fff;
  }
  .navbar-mobile .container .navbar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding-right: 1em;
    padding-left: 1em;
    box-sizing: border-box;
    position: relative;
  }
  .navbar-mobile .container .navbar-header .menu-toggle {
    cursor: pointer;
    line-height: 5.5em;
    padding: auto 2em;
  }
  .navbar-mobile .container .navbar-header .menu-toggle span {
    display: block;
    background: #000;
    width: 36px;
    height: 2px;
    -webkit-border-radius: 3px;
    -moz-border-radius: 3px;
    border-radius: 3px;
    -webkit-transition: 0.25s margin 0.25s, 0.25s transform;
    -moz-transition: 0.25s margin 0.25s, 0.25s transform;
    transition: 0.25s margin 0.25s, 0.25s transform;
  }
  .dark-theme .navbar-mobile .container .navbar-header .menu-toggle span {
    background: #a9a9b3;
  }
  .navbar-mobile .container .navbar-header .menu-toggle span:nth-child(1) {
    margin-bottom: 8px;
  }
  .navbar-mobile .container .navbar-header .menu-toggle span:nth-child(3) {
    margin-top: 8px;
  }
  .navbar-mobile .container .navbar-header .menu-toggle.active span {
    -webkit-transition: 0.25s margin, 0.25s transform 0.25s;
    -moz-transition: 0.25s margin, 0.25s transform 0.25s;
    transition: 0.25s margin, 0.25s transform 0.25s;
  }
  .navbar-mobile
    .container
    .navbar-header
    .menu-toggle.active
    span:nth-child(1) {
    -moz-transform: rotate(45deg) translate(4px, 6px);
    -ms-transform: rotate(45deg) translate(4px, 6px);
    -webkit-transform: rotate(45deg) translate(4px, 6px);
    transform: rotate(45deg) translate(4px, 6px);
  }
  .navbar-mobile
    .container
    .navbar-header
    .menu-toggle.active
    span:nth-child(2) {
    opacity: 0;
  }
  .navbar-mobile
    .container
    .navbar-header
    .menu-toggle.active
    span:nth-child(3) {
    -moz-transform: rotate(-45deg) translate(8px, -10px);
    -ms-transform: rotate(-45deg) translate(8px, -10px);
    -webkit-transform: rotate(-45deg) translate(8px, -10px);
    transform: rotate(-45deg) translate(8px, -10px);
  }
  .navbar-mobile .container .menu {
    text-align: center;
    background: #fff;
    /*border-top: 1px solid #000;*/
    padding-top: 1em;
    padding-bottom: 1em;
    display: none;
    box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.1), 0px 4px 8px rgba(0, 0, 0, 0.1);
  }
  .navbar-mobile .container .menu a {
    display: inline-block;
    margin: 0 1em;
    line-height: 2.5em;
  }
  .navbar-mobile .container .menu.active {
    display: block;
    white-space: nowrap;
    box-sizing: border-box;
    overflow-x: auto;
  }
  .dark-theme .navbar-mobile .container .menu {
    background: #292a2d;
    /*border-top: 1px solid #87878d;*/
  }
  .dark-theme .navbar-mobile .container {
    background: #292a2d !important;
  }
  .archive {
    width: 90%;
  }
  .archive .archive-item .archive-item-date {
    display: none;
  }
  #dynamic-to-top {
    display: none !important;
  }
  .footer {
    height: 3rem;
    width: 100%;
    text-align: center;
    line-height: 1.5rem;
    padding-top: 2em;
  }
  .post-warp {
    padding-top: 6em;
  }
  .post-warp .archive-item-date {
    display: none;
  }
  .categories .categories-card .card-item {
    width: 100%;
    display: flex;
    min-height: 0;
  }
  .categories .categories-card .card-item .categories {
    overflow: hidden;
  }
  .signature-img {
    width: 100%;
  }
  .signature-box img {
    height: 100px !important;
  }
  .signature-img img {
    height: 100px;
  }
  .signature-action,
  .vip-action {
    width: 100%;
  }
  .signature-action select,
  .vip-action select {
    width: 100%;
  }
  .signature-action input,
  .vip-action input {
    width: 200px;
    float: left;
    margin-top: 5px;
  }
  .signature-action button,
  .vip-action button {
    width: 200px;
    margin-top: 5px;
  }
  .mta-box {
    width: 100% !important;
  }
  .mta-a ul li {
    width: 100% !important;
  }
  .navbar-mobile {
    display: none;
  }
}
@media only screen and (min-device-width: 768px) {
  .navbar-mobile {
    display: none;
  }
}
@media only screen and (min-width: 1024px) {
  .navbar-mobile {
    display: none;
  }
}
.loader {
  box-sizing: content-box;
  display: block;
  position: absolute;
  top: 50%;
  left: 50%;
  margin: 0;
  text-align: center;
  z-index: 1000;
  -webkit-transform: translateX(-50%) translateY(-50%);
  transform: translateX(-50%) translateY(-50%);
}
.loader:before {
  position: absolute;
  content: "";
  top: 0;
  left: 50%;
  width: 50px;
  height: 50px;
  margin: 0 0 0 -25px;
  border-radius: 50px;
  border: 4px solid rgba(0, 0, 0, 0.1);
}
.loader:after {
  position: absolute;
  content: "";
  top: 0;
  left: 50%;
  width: 50px;
  height: 50px;
  margin: 0 0 0 -25px;
  animation: loader 0.6s linear;
  animation-iteration-count: infinite;
  border-radius: 50px;
  border: 4px solid transparent;
  border-top-color: #767676;
  box-shadow: 0 0 0 1px transparent;
}
@keyframes loader {
  from {
    -webkit-transform: rotate(0deg);
    transform: rotate(0deg);
  }
  to {
    -webkit-transform: rotate(360deg);
    transform: rotate(360deg);
  }
}
.dark-theme .post-content {
  background: #292a2d !important;
  color: #eee !important;
}
.dark-theme .post-content p code,
.dark-theme .post-content ul li code {
  background: #292a2d !important;
}
.apps {
  color: red;
  font-weight: bold;
}
.signature-box {
  margin-top: 100px;
  text-align: center;
}
.signature-box img {
  border: none;
  height: 145px;
  margin-bottom: 50px;
}
.signature-action select,
.vip-action select {
  height: 30px;
}
.signature-action input,
.vip-action input {
  height: 25px;
  padding-left: 5px;
}
.signature-action input:focus,
.vip-action input:focus {
  outline: none;
}
.signature-action button,
.vip-action button {
  width: 135px;
  height: 30px;
}
.tag-cloud-tags-extend {
  padding-top: 0;
}
.hidden {
  display: none;
}
.vip-action {
  text-align: center;
}
.imgbox {
  width: 70%;
  text-align: center;
  margin: 80px auto 0;
}
.imgbox img {
  max-width: 100%;
  max-height: 100%;
}
.girl-qrcode {
  text-align: center;
}
.girl-img {
  width: 20%;
}
.btnbox {
  text-align: center;
  margin-top: 20px;
}
.tab-box {
  margin: 0 auto;
  margin-top: 50px;
  width: 1150px;
}
.top-tab {
  font-weight: bold;
  float: left;
  margin-top: 5px;
}
.top-tab ul li {
  list-style: none;
}
.top-tab ul li a.archive {
  color: #5a9600;
}
.top-content {
  float: left;
}
.top-content ul li {
  list-style: none;
  height: 35px;
  line-height: 35px;
  width: 888px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mta-box {
  width: 75%;
  margin: 100px auto 0;
}
.mta-a {
  margin: 20px 68px 50px 20px;
}
.mta-a ul {
  width: auto;
  display: none;
}
.mta-a ul li {
  float: left;
  width: 25%;
  list-style: none;
}
.mta-a-item {
  margin: 0 10px;
  border: 1px solid #e1e1e1;
  background: #fff;
  min-height: 60px;
}
.mta-a-title {
  padding: 16px 16px 0;
  height: 20px;
  line-height: 20px;
}
.mta-a-value {
  height: 100%;
  font-size: 30px;
  height: 24px;
  margin: 20px 0 20px 30px;
}
.mta-date {
  text-align: right;
  padding-right: 5px;
}
.dark-theme .mta-a-item {
  border: 1px solid #a9a9b3;
  background: transparent;
}
.qrcode {
  width: 120px;
  z-index: 99999;
  opacity: 0.8;
  margin: 20px auto 0;
}
.qrcode img {
  width: 100%;
}
.soul {
  text-align: center;
  margin-top: 200px;
}
.soul-btn {
  background-color: #5a9600;
  border: 5px;
  color: white;
  padding: 15px 32px;
  text-align: center;
  text-decoration: none;
  display: inline-block;
  font-size: 16px;
  margin: 4px 2px;
  cursor: pointer;
  -webkit-transition-duration: 0.4s;
  transition-duration: 0.4s;
}
.soul-btn:hover {
  box-shadow: 0 12px 16px 0 rgba(0, 0, 0, 0.24), 0 17px 50px 0 rgba(0, 0, 0, 0.19);
}
```

:::

在 css 中用到了开源的 FiraCode 字体，可以自己去下载，不过在 css 中我已经改为远程地址了。

删掉 wwwroot/sample-data、wwwroot/css/bootstrap、wwwroot/css/open-iconic 三个文件夹。

在 wwwroot 文件夹下，有一个 index.html，这个是我们网站的入口，注意里面有一对标签：`<app>Loading...</app>`，这个标签里面的内容会在 wasm 加载完毕后自动清除掉，所以，一般可以用来做加载提示。

现在改造一下`index.html`，代码如下：

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
    />
    <meta name="keywords" content="Meowv,qix,阿星Plus,个人博客" />
    <meta
      name="description"
      content="阿星Plus的个人博客,用于发表原创文章,关注微信公众号：『阿星Plus』了解更多。"
    />
    <title>😍阿星Plus⭐⭐⭐</title>
    <base href="/" />
    <link href="css/app.css" rel="stylesheet" />
  </head>

  <body>
    <app>
      <div class="loader"></div>
    </app>
    <script src="_framework/blazor.webassembly.js"></script>
  </body>
</html>
```

千万注意，`blazor.webassembly.js` 这个 js 不可以删除，会在项目打包后自动生成这个 js 文件。

然后我们一点一点完善，`Program.cs`默认就行暂时不需要做任何改动。

`Pages`文件夹内的 Razor 组件就是我们的具体页面了，干掉默认的`Counter.razor`和`FetchData.razor`，留下`Index.razor`，当作我们的首页。

`Shared`文件夹内可以放一些共享的组件，比如我们的模板`MainLayout.razor`就在里面，它需要继承`LayoutComponentBase`。

所以现在可以来修改一下我们的模板内容。

以我博客的 UI 架构而言，博客分为了三个部分，头部、尾部、内容。

```html
@inherits LayoutComponentBase

<div class="wrapper">
  <header />
  @Body
  <footer />
</div>
```

`@Body`为固定语法，表示这里是内容部分，其他的不变，只在这里填充内容。

在 Shared 文件夹中添加两个组件，头部：`Header.razor`、尾部：`Footer.razor`。

`Header.razor`的内容如下：

```html
<!-- Header.razor -->
<header>
  <nav class="navbar">
    <div class="container">
      <div class="navbar-header header-logo">
        <NavLink class="menu-item" href="/" Match="NavLinkMatch.All">
          😍阿星Plus
        </NavLink>
      </div>
      <div class="menu navbar-right">
        <NavLink class="menu-item" href="posts">Posts</NavLink>
        <NavLink class="menu-item" href="categories">Categories</NavLink>
        <NavLink class="menu-item" href="tags">Tags</NavLink>
        <NavLink class="menu-item apps" href="apps">Apps</NavLink>
        <input id="switch_default" type="checkbox" class="switch_default" />
        <label for="switch_default" class="toggleBtn"></label>
      </div>
    </div>
  </nav>
  <nav class="navbar-mobile">
    <div class="container">
      <div class="navbar-header">
        <div>
          <NavLink class="menu-item" href="" Match="NavLinkMatch.All"
            >😍阿星Plus</NavLink
          >
          <NavLink>&nbsp;·&nbsp;Light</NavLink>
        </div>
        <div class="menu-toggle">&#9776; Menu</div>
      </div>
      <div class="menu">
        <NavLink class="menu-item" href="posts">Posts</NavLink>
        <NavLink class="menu-item" href="categories">Categories</NavLink>
        <NavLink class="menu-item" href="tags">Tags</NavLink>
        <NavLink class="menu-item apps" href="apps">Apps</NavLink>
      </div>
    </div>
  </nav>
</header>
```

可以看到有很多的`NavLink`组件，这是我将 a 标签转换后的内容，其实最终生成的也是我们熟悉的 a 标签，不过他自然有独特用处，看介绍：

> 创建导航链接时，请使用 NavLink 组件代替 HTML 超链接元素 (&lt;a&gt;)。 NavLink 组件的行为方式类似于 &lt;a&gt; 元素，但它根据其 href 是否与当前 URL 匹配来切换 active CSS 类。 active 类可帮助用户了解所显示导航链接中的哪个页面是活动页面。
> ...

`Footer.razor`的内容如下：

```html
<!-- Footer.razor -->
<footer id="footer" class="footer">
  <div class="copyright">
    <span>
      Powered by <a target="_blank" href="http://dot.net">.NET Core 3.1</a> and
      <a href="http://blazor.net/">Blazor</a> on Linux
    </span>
  </div>
</footer>
```

然后删掉默认的多余的组件：`NavMenu.razor`和`SurveyPrompt.razor`。

还有一个`_Imports.razor`，这个就是用来导入命名空间的，放在这里面就相当于全局引用了。

现在去编辑我们的首页`Index.razor`。

```html
@page "/"

<div class="main">
  <div class="container">
    <div class="intro">
      <div class="avatar">
        <a href="javascript:;"
          ><img src="https://static.meowv.com/images/avatar.jpg"
        /></a>
      </div>
      <div class="nickname">阿星Plus</div>
      <div class="description">
        <p>
          生命不息，奋斗不止
          <br />Cease to struggle and you cease to live
        </p>
      </div>
      <div class="links">
        <NavLink class="link-item" title="Posts" href="posts">
          <i class="iconfont iconread"></i>
        </NavLink>
        <NavLink
          target="_blank"
          class="link-item"
          title="Notes"
          href="https://notes.meowv.com/"
        >
          <i class="iconfont iconnotes"></i>
        </NavLink>
        <NavLink
          target="_blank"
          class="link-item"
          title="API"
          href="https://api.meowv.com/"
        >
          <i class="iconfont iconapi"></i>
        </NavLink>
        <NavLink class="link-item" title="Manage" href="/account/auth">
          <i class="iconfont iconcode"></i>
        </NavLink>
        <NavLink
          target="_blank"
          class="link-item"
          title="Github"
          href="https://github.com/Meowv/"
        >
          <i class="iconfont icongithub"></i>
        </NavLink>
        <NavLink
          class="link-item weixin"
          title="扫码关注微信公众号：『阿星Plus』查看更多。"
        >
          <i class="iconfont iconweixin"></i>
        </NavLink>
        <div class="qrcode">
          <img src="https://static.meowv.com/images/wx_qrcode.jpg" />
        </div>
      </div>
    </div>
  </div>
</div>
```

`@page`指令用于设置页面路由地址，因为是首页，所以直接给一个"/"就可以了。

至此项目算是搭建完成并且将其改造了一番，现在可以去运行一下看看效果了。

![ ](/images/abp/blazor-bestpractice-1-03.png)

第一次打开或者强制刷新页面会出现加载中的界面，我这里就是一个小圈圈在那里转，当加载完毕后就会自动消失，什么都不需要干，太方便了。

现在已经成功将首页的显示搞定了，随便点击几个按钮试试，会输出一个错误提示：Sorry, there's nothing at this address，因为没有找到这些路由，所以就...

默认的有点丑，并且这句提示当然也可以自定义的，现在来看最后的一个组件`App.razor`。

```html
<Router AppAssembly="@typeof(Program).Assembly">
  <Found Context="routeData">
    <RouteView RouteData="@routeData" DefaultLayout="@typeof(MainLayout)" />
  </Found>
  <NotFound>
    <LayoutView Layout="@typeof(MainLayout)">
      <p>Sorry, there's nothing at this address.</p>
    </LayoutView>
  </NotFound>
</Router>
```

通过语义化的代码不难理解，`Found`就是找到与之匹配的路由，然后调用模板`MainLayout`，`NotFound`就是没有找到的情况下，使用`MainLayout`并且在`@body`输出一句提示。

将这句错误提示做成一个公共的组件并且美化一下，在 Shared 文件夹下新建组件：`ErrorTip.razor`，内容如下：

```html
<div class="main">
  <div class="post-wrap">
    <h2 class="eror-tip">Sorry, there's nothing at this address.😖😖😖</h2>
  </div>
</div>
```

使用组件也很简单，在`App.razor`中删掉默认的 p 标签然后调用`ErrorTip`。

```html
...
<NotFound>
  <LayoutView Layout="@typeof(MainLayout)">
    <ErrorTip />
  </LayoutView>
</NotFound>
...
```

再看一下打开了不存在路由的页面的错误提示吧。

![ ](/images/abp/blazor-bestpractice-1-04.png)

哈哈哈，是不是好看许多，接下来会完成主题切换，菜单展开关闭等等功能，其实这些可以用 JavaScript 很方便的实现，但是既然用了 Blazor 开发，所以还是用 .NET 代码实现吧。

本篇就先到这里，未完待续...
