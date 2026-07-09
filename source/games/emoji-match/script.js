/**
 * 表情符号消除小游戏
 *
 * 玩法规则：
 * 1. 在4x4网格中选择2个相同的表情符号可以消除它们
 * 2. 成功消除后会产生新的随机排列，时间增加5秒
 * 3. 在60秒内消除尽可能多的表情符号
 */

(function () {
    'use strict';

    // 表情符号池
    const EMOJIS = [
        '😄', '🤣', '🙂', '🙃', '😉', '😇', '😍', '🤥', '😘', '😚',
        '😛', '😜', '😋', '🤗', '🤔', '🤐', '😶', '🤑', '😏', '🙄',
        '😳', '😬', '😴', '🤕', '🤠', '🤧', '😢', '😵', '😎', '🤓',
        '😡', '🤢', '😭', '😫', '😠'
    ];

    // 游戏状态
    let timeLimit = 60 * 1000; // 60秒（毫秒）
    let timeLeft = timeLimit;
    let timeInt = null;         // 计时器
    let lastBtn = null;         // 上一次点击的按钮
    let hint = null;            // 当前提示答案（用于配对的emoji）
    let msTilHint = 5000;       // 距离提示出现的时间
    let found = 0;              // 已消除次数

    // DOM元素
    let game, btnArea, hintBtn, replayBtn, timeTxtEl, timePlusEl, foundTxtEl, endEl, endTxtEl, container;

    // 初始化
    function init() {
        game = document.getElementById('game');
        btnArea = document.getElementById('btnArea');
        hintBtn = document.getElementById('hintBtn');
        replayBtn = document.getElementById('replayBtn');
        timeTxtEl = document.querySelector('.timeTxt');
        timePlusEl = document.querySelector('.timePlus');
        foundTxtEl = document.querySelector('.foundTxt');
        endEl = document.querySelector('.end');
        endTxtEl = document.querySelector('.endTxt');
        container = document.getElementById('container');

        // 创建16个按钮
        createButtons();

        // 绑定事件
        hintBtn.addEventListener('click', onHintClick);
        hintBtn.addEventListener('touchend', onHintTouch);
        replayBtn.addEventListener('click', onReplayClick);
        replayBtn.addEventListener('touchend', onReplayTouch);

        // 初始化填充
        populate();

        // 显示容器
        requestAnimationFrame(function () {
            container.classList.add('active');
        });
    }

    // 创建16个按钮
    function createButtons() {
        for (let i = 1; i <= 16; i++) {
            const btn = document.createElement('div');
            btn.className = 'btn';
            btn.id = 'b' + i;
            btn.dataset.index = i;
            btn.addEventListener('click', onBtnClick);
            btn.addEventListener('touchend', onBtnTouch);
            btnArea.appendChild(btn);
        }
    }

    // 获取所有按钮元素
    function getButtons() {
        return Array.from(btnArea.querySelectorAll('.btn'));
    }

    // 填充按钮（初始化/重新随机）
    function populate() {
        lastBtn = null;
        msTilHint = 5000;

        // 重置提示按钮
        hintBtn.classList.remove('visible', 'hint-active');
        hintBtn.textContent = '提示?';
        hintBtn.style.fontSize = '';
        hintBtn.style.width = '';

        // 按钮出现动画（从中心扩散）
        const buttons = getButtons();
        buttons.forEach(function (btn, idx) {
            btn.style.opacity = '0';
            btn.style.transform = 'scale(0.2)';
        });

        // 生成交错动画延迟（从中心扩散）
        const gridOrder = [6, 7, 10, 11, 5, 8, 9, 12, 2, 3, 14, 15, 1, 4, 13, 16];
        gridOrder.forEach(function (pos, delay) {
            const btn = document.getElementById('b' + pos);
            setTimeout(function () {
                btn.classList.add('appear');
                btn.style.opacity = '';
                btn.style.transform = '';
                setTimeout(function () {
                    btn.classList.remove('appear');
                }, 300);
            }, delay * 20);
        });

        // 生成15个不重复的emoji，第16个与其中一个配对
        var chosen = [];
        for (var i = 0; i < 15; i++) {
            makeNewEmoji();
        }

        function makeNewEmoji() {
            var n = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
            var exists = false;
            for (var j = 0; j < chosen.length; j++) {
                if (n === chosen[j]) {
                    exists = true;
                    break;
                }
            }
            if (exists) {
                makeNewEmoji();
            } else {
                chosen.push(n);
            }
        }

        // 提示答案是第15个（索引14）
        hint = chosen[14];
        // 添加配对emoji
        chosen.push(chosen[14]);
        // 打乱数组
        shuffleArray(chosen);

        // 设置按钮文本
        buttons.forEach(function (btn, idx) {
            btn.textContent = chosen[idx];
            btn.classList.remove('selected', 'matched', 'hint-pulse');
        });
    }

    // 按钮点击处理
    function onBtnClick(e) {
        handleBtnClick(e.currentTarget);
    }

    function onBtnTouch(e) {
        e.preventDefault();
        handleBtnClick(e.currentTarget);
    }

    function handleBtnClick(btn) {
        // 首次点击启动计时器
        if (timeInt === null) {
            timeLeft = timeLimit;
            timeInt = setInterval(updateTime, 10);
        }

        // 点击动画
        btn.style.transform = 'scale(0.95)';
        setTimeout(function () {
            btn.style.transform = '';
        }, 50);

        // 如果是同一个按钮，不做处理
        if (lastBtn === btn) return;

        if (lastBtn !== null) {
            // 检查是否匹配
            if (btn.textContent === lastBtn.textContent) {
                // 匹配成功！
                found++;
                timeLeft += 5000; // 增加5秒

                // 显示匹配成功动画
                showMatchAnimation(btn, lastBtn);

                // 延迟后重新填充
                setTimeout(function () {
                    populate();
                }, 600);

                return;
            } else {
                // 不匹配，清除上一个选中状态
                lastBtn.classList.remove('selected');
            }
        }

        // 选中当前按钮
        btn.classList.add('selected');
        lastBtn = btn;
    }

    // 显示匹配成功动画
    function showMatchAnimation(btn1, btn2) {
        // 更新已找到数量
        foundTxtEl.textContent = '已找到: ' + found;
        foundTxtEl.style.fontWeight = '500';

        // +5秒动画
        timePlusEl.classList.remove('show');
        void timePlusEl.offsetWidth; // 强制重绘
        timePlusEl.classList.add('show');
        setTimeout(function () {
            timePlusEl.classList.remove('show');
        }, 600);

        // 匹配成功按钮动画
        btn1.classList.remove('selected');
        btn2.classList.remove('selected');
        btn1.classList.add('matched');
        btn2.classList.add('matched');

        // 清除匹配状态
        setTimeout(function () {
            btn1.classList.remove('matched');
            btn2.classList.remove('matched');
            var buttons = getButtons();
            buttons.forEach(function (b) {
                b.classList.remove('selected');
            });
        }, 500);
    }

    // 更新计时器
    function updateTime() {
        if (timeLeft > 0) {
            timeLeft -= 10;

            // 更新显示
            var mil = Math.floor((timeLeft % 1000) / 10);
            var sec = Math.floor(timeLeft / 1000);
            if (mil < 10) mil = '0' + mil;
            if (sec < 10) sec = '0' + sec;
            timeTxtEl.textContent = sec + ':' + mil;

            // 提示按钮逻辑
            if (msTilHint < 1) {
                hintBtn.classList.add('visible');
            } else {
                msTilHint -= 10;
            }
        } else {
            // 游戏结束
            gameOver();
        }
    }

    // 游戏结束
    function gameOver() {
        clearInterval(timeInt);
        timeInt = null;

        // 如果还没找到过，设置文本
        if (found === 0) {
            foundTxtEl.textContent = '已找到: 0';
        }

        // 显示结束界面
        endTxtEl.textContent = hint + ' 再试一次? ' + hint;
        endTxtEl.style.fontSize = '25px';

        // 隐藏游戏元素
        timeTxtEl.style.opacity = '0';
        hintBtn.style.opacity = '0';
        btnArea.style.opacity = '0';
        hintBtn.classList.remove('visible');

        var buttons = getButtons();
        buttons.forEach(function (btn) {
            btn.classList.remove('selected');
        });

        // 显示结束遮罩
        setTimeout(function () {
            endEl.classList.add('active');
        }, 100);

        // 显示重玩按钮（旋转进入）
        setTimeout(function () {
            replayBtn.classList.add('active');
            replayBtn.style.animation = 'spinIn 1s ease forwards';
        }, 500);

        // 最终得分动画
        setTimeout(function () {
            foundTxtEl.style.transform = 'scale(2.5) translateY(130px)';
            foundTxtEl.style.transition = 'transform 0.4s ease';
        }, 200);
    }

    // 重玩按钮点击
    function onReplayClick() {
        restartGame();
    }

    function onReplayTouch(e) {
        e.preventDefault();
        restartGame();
    }

    // 重新开始游戏
    function restartGame() {
        // 隐藏重玩按钮
        replayBtn.classList.remove('active');
        replayBtn.style.animation = '';
        replayBtn.style.transform = 'scale(0)';

        // 隐藏结束界面
        endEl.classList.remove('active');

        // 重置得分文本
        setTimeout(function () {
            foundTxtEl.style.transform = '';
            foundTxtEl.style.transition = '';
            foundTxtEl.textContent = '找到配对...';
            foundTxtEl.style.fontWeight = '300';

            timeTxtEl.textContent = '60:00';
            timeTxtEl.style.opacity = '1';
            btnArea.style.opacity = '1';

            // 重置游戏状态
            found = 0;
            lastBtn = null;
            hint = null;
            timeLeft = timeLimit;

            // 重新填充
            populate();
        }, 300);
    }

    // 提示按钮点击
    function onHintClick(e) {
        if (hint) {
            hintBtn.textContent = hint;
            hintBtn.style.fontSize = '35px';
            hintBtn.style.width = 'auto';
            hintBtn.classList.add('hint-active');
        }
    }

    function onHintTouch(e) {
        e.preventDefault();
        if (hint) {
            hintBtn.textContent = hint;
            hintBtn.style.fontSize = '35px';
            hintBtn.style.width = 'auto';
            hintBtn.classList.add('hint-active');
        }
    }

    // 工具函数：打乱数组（Fisher-Yates）
    function shuffleArray(array) {
        for (var i = array.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
    }

    // 启动游戏
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
