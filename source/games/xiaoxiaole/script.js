document.addEventListener('DOMContentLoaded', () => {
    // 游戏状态
    const gameState = {
        board: [], // 5x5 棋盘
        clicksLeft: 5, // 剩余点击次数
        maxClicks: 5, // 最大点击次数
        boardSize: 5, // 棋盘大小
        isAnimating: false, // 动画进行中标记
        cellElements: [], // 存储DOM元素引用
        score: 0, // 积分
        maxNumberInGame: 1, // 本局游戏中的最大数字
        isNewNumberRecord: false,
        isNewScoreRecord: false,
        soundEnabled: true // 音效开关状态
    };

    // 音效管理
    const sounds = {
        click: new Audio('sounds/pop.mp3'),
        merge: new Audio('sounds/level-up.mp3')
    };

    // 音效控制函数
    function playSound(soundName) {
        if (gameState.soundEnabled && sounds[soundName]) {
            sounds[soundName].currentTime = 0;
            sounds[soundName].play().catch(error => console.log('音效播放失败:', error));
        }
    }

    const gameBoard = document.getElementById('game-board');
    const clicksLeftElement = document.getElementById('clicks-left');
    const clicksProgressBar = document.getElementById('clicks-progress-bar');
    const restartButton = document.getElementById('restart-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const scoreElement = document.createElement('div');
    scoreElement.classList.add('score-display');
    scoreElement.textContent = '积分: 0';
    document.querySelector('.game-info').appendChild(scoreElement);

    // 创建历史记录显示元素
    const recordsElement = document.createElement('div');
    recordsElement.classList.add('records-display');
    
    // 将记录元素添加到TapMe标题之前
    const container = document.querySelector('.container');
    const title = document.querySelector('h1');
    container.insertBefore(recordsElement, title);
    
    // 创建包含记录和主题切换的顶部容器
    const topContainer = document.createElement('div');
    topContainer.classList.add('top-container');
    container.insertBefore(topContainer, title);
    
    // 将记录元素移动到顶部容器
    topContainer.appendChild(recordsElement);
    
    // 将主题切换从当前位置移除并添加到顶部容器
    const themeSwitch = document.querySelector('.theme-switch');
    document.querySelector('.game-info').removeChild(themeSwitch);
    topContainer.appendChild(themeSwitch);

    // 创建音效开关
    const soundSwitch = document.createElement('div');
    soundSwitch.classList.add('sound-switch');
    soundSwitch.innerHTML = `
        <label class="switch">
            <input type="checkbox" id="sound-toggle" checked>
            <span class="slider round"></span>
        </label>
        <span>音效</span>
    `;
    topContainer.appendChild(soundSwitch);

    // 音效开关事件
    const soundToggle = document.getElementById('sound-toggle');
    soundToggle.addEventListener('change', () => {
        gameState.soundEnabled = soundToggle.checked;
        localStorage.setItem('tapmeSound', soundToggle.checked);
    });

    // 从本地存储加载音效设置
    const savedSound = localStorage.getItem('tapmeSound');
    if (savedSound !== null) {
        gameState.soundEnabled = savedSound === 'true';
        soundToggle.checked = gameState.soundEnabled;
    }

    // 初始化主题
    initTheme();
    
    // 初始化游戏
    initGame();

    // 重新开始游戏按钮事件
    restartButton.addEventListener('click', () => {
        // 显示自定义确认弹窗，而不是使用confirm
        showConfirmModal('确定要重新开始游戏吗？', '当前游戏进度将丢失。', () => {
            // 确认后执行
            localStorage.removeItem('tapmeGameState');
            initGame();
        });
    });
    
    // 主题切换事件
    themeToggle.addEventListener('change', toggleTheme);

    // 初始化主题
    function initTheme() {
        // 检查本地存储中是否有保存的主题偏好
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
            themeToggle.checked = savedTheme === 'dark';
        } else {
            // 检查系统偏好
            const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (prefersDarkScheme) {
                document.documentElement.setAttribute('data-theme', 'dark');
                themeToggle.checked = true;
                localStorage.setItem('theme', 'dark');
            }
        }
    }
    
    // 切换主题函数
    function toggleTheme() {
        const newTheme = themeToggle.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    }

    // 初始化游戏
    function initGame() {
        // 尝试从localStorage加载游戏状态
        const savedState = loadGameState();
        
        if (savedState) {
            // 如果有已保存的状态，加载它
            gameState.board = savedState.board;
            gameState.clicksLeft = savedState.clicksLeft;
            gameState.score = savedState.score || 0; // 兼容旧存档
            gameState.maxNumberInGame = savedState.maxNumberInGame || 1; // 兼容旧存档
        } else {
            // 否则初始化新游戏
            gameState.clicksLeft = gameState.maxClicks;
            gameState.score = 0;
            gameState.maxNumberInGame = 1;
            initializeBoard();
        }
        
        // 更新点击次数显示和进度条
        updateClicksDisplay();
        updateScoreDisplay();
        updateRecordsDisplay();
        gameState.isAnimating = false;
        
        // 创建或更新棋盘DOM
        createBoardDOM();
        
        // 移除任何可能存在的游戏结束弹框
        const existingModal = document.getElementById('game-end-modal');
        if (existingModal) {
            document.body.removeChild(existingModal);
        }
    }
    
    // 更新点击次数显示和进度条
    function updateClicksDisplay() {
        // 更新数字显示
        clicksLeftElement.textContent = gameState.clicksLeft;
        
        // 更新进度条
        const progressPercent = (gameState.clicksLeft / gameState.maxClicks) * 100;
        clicksProgressBar.style.width = `${progressPercent}%`;
        
        // 根据剩余次数更改进度条颜色
        if (progressPercent <= 20) {
            clicksProgressBar.style.backgroundColor = '#ff5252'; // 红色
        } else if (progressPercent <= 60) {
            clicksProgressBar.style.backgroundColor = '#ffd740'; // 黄色
        } else {
            clicksProgressBar.style.backgroundColor = ''; // 使用默认颜色(变量)
        }
    }
    
    // 更新积分显示
    function updateScoreDisplay() {
        scoreElement.textContent = `积分: ${gameState.score}`;
    }
    
    // 更新历史记录显示
    function updateRecordsDisplay() {
        const highestNumber = localStorage.getItem('tapmeHighestNumber') || 1;
        const highestScore = localStorage.getItem('tapmeHighestScore') || 0;
        
        recordsElement.innerHTML = `
            <div>最高数字: ${highestNumber}</div>
            <div>最高积分: ${highestScore}</div>
        `;
    }
    
    // 保存游戏状态到localStorage
    function saveGameState() {
        const stateToSave = {
            board: gameState.board,
            clicksLeft: gameState.clicksLeft,
            score: gameState.score,
            maxNumberInGame: gameState.maxNumberInGame
        };
        localStorage.setItem('tapmeGameState', JSON.stringify(stateToSave));
    }
    
    // 从localStorage加载游戏状态
    function loadGameState() {
        const savedState = localStorage.getItem('tapmeGameState');
        if (savedState) {
            try {
                return JSON.parse(savedState);
            } catch (e) {
                console.error('加载游戏存档失败:', e);
                return null;
            }
        }
        return null;
    }

    // 初始化棋盘，保证初始状态没有连通组
    function initializeBoard() {
        gameState.board = [];
        
        // 创建随机棋盘
        for (let i = 0; i < gameState.boardSize; i++) {
            gameState.board[i] = [];
            for (let j = 0; j < gameState.boardSize; j++) {
                gameState.board[i][j] = Math.floor(Math.random() * 5) + 1; // 1-5的随机数
            }
        }
        
        // 检查并修复初始连通组
        while (hasConnectedGroups()) {
            for (let i = 0; i < gameState.boardSize; i++) {
                for (let j = 0; j < gameState.boardSize; j++) {
                    gameState.board[i][j] = Math.floor(Math.random() * 5) + 1;
                }
            }
        }
    }

    // 创建棋盘DOM元素
    function createBoardDOM() {
        gameBoard.innerHTML = '';
        gameState.cellElements = [];
        
        for (let i = 0; i < gameState.boardSize; i++) {
            gameState.cellElements[i] = [];
            for (let j = 0; j < gameState.boardSize; j++) {
                const cell = document.createElement('div');
                cell.classList.add('cell');
                
                const value = gameState.board[i][j];
                if (value !== null) {
                    cell.textContent = value;
                    cell.setAttribute('data-value', value);
                } else {
                    cell.classList.add('empty');
                }
                
                cell.dataset.row = i;
                cell.dataset.col = j;
                cell.addEventListener('click', handleCellClick);
                
                gameBoard.appendChild(cell);
                gameState.cellElements[i][j] = cell;
            }
        }
    }

    // 更新单个格子的显示
    function updateCellDisplay(row, col) {
        const cell = gameState.cellElements[row][col];
        const value = gameState.board[row][col];
        
        if (value !== null) {
            cell.textContent = value;
            cell.setAttribute('data-value', value);
            cell.classList.remove('empty');
        } else {
            cell.textContent = '';
            cell.removeAttribute('data-value');
            cell.classList.add('empty');
        }
    }

    // 处理格子点击事件
    function handleCellClick(event) {
        // 当动画正在进行时，阻止用户点击
        // gameState.isAnimating 在动画开始时设置为 true，动画结束时设置为 false
        // 这确保了在消除、移动和下落动画期间用户不能点击格子
        if (gameState.isAnimating || gameState.clicksLeft <= 0) return;
        
        // 播放点击音效
        playSound('click');
        
        const row = parseInt(event.target.dataset.row);
        const col = parseInt(event.target.dataset.col);
        
        if (gameState.board[row][col] === null) return;
        
        // 平滑增加点击的格子值，避免闪烁
        const oldValue = gameState.board[row][col];
        const newValue = oldValue + 1;
        gameState.board[row][col] = newValue;
        
        // 更新本局游戏中的最大数字
        if (newValue > gameState.maxNumberInGame) {
            gameState.maxNumberInGame = newValue;
        }
        
        // 直接更新DOM元素，避免重新渲染
        const cellElement = gameState.cellElements[row][col];
        cellElement.textContent = newValue;
        cellElement.setAttribute('data-value', newValue);
        cellElement.classList.add('highlight');
        
        // 减少点击次数
        gameState.clicksLeft--;
        updateClicksDisplay();
        
        // 保存游戏状态
        saveGameState();
        
        // 在短暂延迟后移除高亮效果
        setTimeout(() => {
            cellElement.classList.remove('highlight');
            
            // 检查连通组并处理
            processConnectedGroups(row, col);
            
            // 检查游戏是否结束
            if (gameState.clicksLeft <= 0) {
                // 不立即结束游戏，而是等待所有连通组和下落处理完成
                // 创建一个等待函数来检查动画是否完成
                function checkAnimationStatus() {
                    if (gameState.isAnimating) {
                        // 如果仍在动画中，继续等待
                        setTimeout(checkAnimationStatus, 300);
                    } else {
                        // 动画完成后，检查剩余点击次数
                        if (gameState.clicksLeft <= 0) {
                            // 如果仍然为0，才真正结束游戏
                            // 更新历史记录
                            checkGameEndAndUpdateRecords();
                            
                            // 显示自定义游戏结束弹框，而不是使用alert
                            showGameEndModal();
                            
                            // 清除存档
                            localStorage.removeItem('tapmeGameState');
                        } else {
                            // 否则继续游戏
                            console.log('连锁反应增加了点击次数，游戏继续！');
                            // 保存游戏状态
                            saveGameState();
                        }
                    }
                }
                // 开始检查
                setTimeout(checkAnimationStatus, 300);
            }
        }, 150);
    }

    // 检查并处理连通组
    function processConnectedGroups(clickedRow, clickedCol) {
        const connectedGroups = findAllConnectedGroups();
        
        if (connectedGroups.length > 0) {
            gameState.isAnimating = true;
            
            // 依次处理连通组，而不是同时处理
            processNextGroup(connectedGroups, 0, clickedRow, clickedCol);
        }
    }
    
    // 递归处理连通组，一次处理一个
    function processNextGroup(groups, index, clickedRow, clickedCol) {
        if (index >= groups.length) {
            // 所有连通组都处理完毕，进行下落
            setTimeout(() => {
                applyGravity();
            }, 50);
            return;
        }
        
        // 播放消除音效
        playSound('merge');
        
        const group = groups[index];
        
        if (group.length >= 3) {
            // 判断点击的格子是否在连通组中
            const clickedInGroup = group.some(cell => cell.row === clickedRow && cell.col === clickedCol);
            
            // 记录需要清除的格子和目标格子
            let cellsToClear = [];
            let targetCell = null;
            
            if (clickedInGroup) {
                // 如果点击的格子在连通组中
                targetCell = group.find(cell => cell.row === clickedRow && cell.col === clickedCol);
                cellsToClear = group.filter(cell => cell.row !== clickedRow || cell.col !== clickedCol);
            } else {
                // 选择x最大，若x相等则选y最大的格子
                targetCell = group[0];
                for (const cell of group) {
                    if (cell.row > targetCell.row || 
                        (cell.row === targetCell.row && cell.col < targetCell.col)) {
                        targetCell = cell;
                    }
                }
                cellsToClear = group.filter(cell => cell.row !== targetCell.row || cell.col !== targetCell.col);
            }
            
            // 获取目标格子的DOM元素和位置
            const targetElement = gameState.cellElements[targetCell.row][targetCell.col];
            const targetRect = targetElement.getBoundingClientRect();
            
            // 计算增加的积分
            const baseValue = gameState.board[targetCell.row][targetCell.col];
            const scoreIncrease = baseValue * cellsToClear.length;
            
            // 创建并显示得分动画
            const scorePopup = document.createElement('div');
            scorePopup.classList.add('score-popup');
            scorePopup.textContent = `+${scoreIncrease}`;
            scorePopup.style.left = `${targetRect.left}px`;
            scorePopup.style.top = `${targetRect.top - 30}px`;
            document.body.appendChild(scorePopup);
            
            setTimeout(() => {
                scorePopup.classList.add('fade-up');
                setTimeout(() => {
                    document.body.removeChild(scorePopup);
                }, 1000);
            }, 10);
            
            // 增加积分
            gameState.score += scoreIncrease;
            updateScoreDisplay();
            
            // 依次处理每个需要清除的格子
            processCellsSequentially(cellsToClear, 0, targetCell, targetRect, () => {
                // 所有格子消失后，增加目标格子的值
                setTimeout(() => {
                    gameState.board[targetCell.row][targetCell.col]++;
                    
                    // 更新本局游戏中的最大数字
                    if (gameState.board[targetCell.row][targetCell.col] > gameState.maxNumberInGame) {
                        gameState.maxNumberInGame = gameState.board[targetCell.row][targetCell.col];
                    }
                    
                    updateCellDisplay(targetCell.row, targetCell.col);
                    
                    // 当出现连通数>=3时，增加计数器的值，但最大为5
                    gameState.clicksLeft = Math.min(gameState.clicksLeft + 1, gameState.maxClicks);
                    updateClicksDisplay();
                    
                    // 不需要等待放大动画结束，直接处理下一个连通组
                    setTimeout(() => {
                        // 处理下一个连通组
                        setTimeout(() => {
                            processNextGroup(groups, index + 1, clickedRow, clickedCol);
                        }, 50);
                    }, 50); // 从120ms减少到50ms，因为不再需要等待grow动画
                }, 50);
            });
        } else {
            // 如果当前连通组不满足条件，处理下一个
            processNextGroup(groups, index + 1, clickedRow, clickedCol);
        }
    }
    
    // 递归处理格子，一次处理一个
    function processCellsSequentially(cells, index, targetCell, targetRect, onComplete) {
        if (index >= cells.length) {
            // 所有格子都处理完毕
            onComplete();
            return;
        }
        
        const cell = cells[index];
        const cellElement = gameState.cellElements[cell.row][cell.col];
        const cellRect = cellElement.getBoundingClientRect();
        
        const clone = cellElement.cloneNode(true);
        clone.classList.add('cell-clone');
        clone.style.width = `${cellRect.width}px`;
        clone.style.height = `${cellRect.height}px`;
        clone.style.left = `${cellRect.left}px`;
        clone.style.top = `${cellRect.top}px`;
        document.body.appendChild(clone);
        
        // 计算移动路径
        const path = findPath(cell, targetCell);
        
        // 确定消失的目标位置
        const finalPos = calculateFinalPosition(cell, targetCell, targetRect);
        
        // 立即在原位置显示空格子
        gameState.board[cell.row][cell.col] = null;
        updateCellDisplay(cell.row, cell.col);
        
        if (path && path.length > 0) {
            animatePath(clone, path, finalPos, () => {
                document.body.removeChild(clone);
                // 处理下一个格子，延迟50ms，创造依次消失的效果
                setTimeout(() => {
                    processCellsSequentially(cells, index + 1, targetCell, targetRect, onComplete);
                }, 50);
            });
        } else {
            clone.classList.add('vanish');
            setTimeout(() => {
                document.body.removeChild(clone);
                // 处理下一个格子
                setTimeout(() => {
                    processCellsSequentially(cells, index + 1, targetCell, targetRect, onComplete);
                }, 50);
            }, 80);
        }
    }

    // 根据格子与目标格子的相对位置计算最终消失位置
    function calculateFinalPosition(cell, targetCell, targetRect) {
        // 计算偏移量
        const offset = 20; // 消失时的偏移距离
        
        // 判断相对位置
        if (cell.row < targetCell.row) {
            // 在目标格子上方，向上消失
            return {
                x: targetRect.left + targetRect.width / 2,
                y: targetRect.top - offset
            };
        } else if (cell.row > targetCell.row) {
            // 在目标格子下方，向下消失
            return {
                x: targetRect.left + targetRect.width / 2,
                y: targetRect.bottom + offset
            };
        } else if (cell.col < targetCell.col) {
            // 在目标格子左侧，向左消失
            return {
                x: targetRect.left - offset,
                y: targetRect.top + targetRect.height / 2
            };
        } else {
            // 在目标格子右侧，向右消失
            return {
                x: targetRect.right + offset,
                y: targetRect.top + targetRect.height / 2
            };
        }
    }

    // 查找所有连通组
    function findAllConnectedGroups() {
        const visited = Array(gameState.boardSize).fill().map(() => Array(gameState.boardSize).fill(false));
        const groups = [];
        
        // 确保我们检查每个单元格
        for (let i = 0; i < gameState.boardSize; i++) {
            for (let j = 0; j < gameState.boardSize; j++) {
                if (!visited[i][j] && gameState.board[i][j] !== null) {
                    const group = [];
                    const value = gameState.board[i][j];
                    
                    // 使用队列进行广度优先搜索，更可靠地找出所有连通格子
                    const queue = [{row: i, col: j}];
                    visited[i][j] = true;
                    
                    while (queue.length > 0) {
                        const cell = queue.shift();
                        group.push(cell);
                        
                        // 检查四个方向
                        const directions = [
                            {row: cell.row - 1, col: cell.col}, // 上
                            {row: cell.row + 1, col: cell.col}, // 下
                            {row: cell.row, col: cell.col - 1}, // 左
                            {row: cell.row, col: cell.col + 1}  // 右
                        ];
                        
                        for (const dir of directions) {
                            const {row, col} = dir;
                            
                            // 检查边界和是否已访问
                            if (row >= 0 && row < gameState.boardSize && 
                                col >= 0 && col < gameState.boardSize && 
                                !visited[row][col] && 
                                gameState.board[row][col] === value) {
                                
                                visited[row][col] = true;
                                queue.push({row, col});
                            }
                        }
                    }
                    
                    if (group.length >= 3) {
                        groups.push(group);
                    }
                }
            }
        }
        
        return groups;
    }

    // 检查是否存在连通组
    function hasConnectedGroups() {
        return findAllConnectedGroups().length > 0;
    }

    // 应用重力效果（下落）
    function applyGravity() {
        let hasFalling = false;
        const movingCells = [];
        const newCells = [];
        
        // 从底部向上处理下落
        for (let col = 0; col < gameState.boardSize; col++) {
            for (let row = gameState.boardSize - 1; row > 0; row--) {
                if (gameState.board[row][col] === null) {
                    let sourceRow = row - 1;
                    while (sourceRow >= 0 && gameState.board[sourceRow][col] === null) {
                        sourceRow--;
                    }
                    
                    if (sourceRow >= 0) {
                        movingCells.push({
                            fromRow: sourceRow,
                            fromCol: col,
                            toRow: row,
                            toCol: col,
                            value: gameState.board[sourceRow][col]
                        });
                        
                        gameState.board[row][col] = gameState.board[sourceRow][col];
                        gameState.board[sourceRow][col] = null;
                        hasFalling = true;
                    }
                }
            }
        }
        
        // 填充顶部空格
        for (let col = 0; col < gameState.boardSize; col++) {
            if (gameState.board[0][col] === null) {
                const newValue = Math.floor(Math.random() * 5) + 1;
                gameState.board[0][col] = newValue;
                newCells.push({
                    row: 0,
                    col: col,
                    value: newValue
                });
                hasFalling = true;
            }
        }
        
        // 应用下落动画
        if (movingCells.length > 0 || newCells.length > 0) {
            movingCells.forEach(move => {
                const fromCell = gameState.cellElements[move.fromRow][move.fromCol];
                const toCell = gameState.cellElements[move.toRow][move.toCol];
                
                const fromRect = fromCell.getBoundingClientRect();
                const toRect = toCell.getBoundingClientRect();
                
                const clone = fromCell.cloneNode(true);
                clone.style.position = 'absolute';
                clone.style.zIndex = '100';
                clone.style.left = `${fromRect.left}px`;
                clone.style.top = `${fromRect.top}px`;
                clone.style.width = `${fromRect.width}px`;
                clone.style.height = `${fromRect.height}px`;
                clone.style.transition = 'top 0.25s ease-in';
                document.body.appendChild(clone);
                
                fromCell.textContent = '';
                fromCell.removeAttribute('data-value');
                fromCell.classList.add('empty');
                
                setTimeout(() => {
                    clone.style.top = `${toRect.top}px`;
                    
                    setTimeout(() => {
                        document.body.removeChild(clone);
                        updateCellDisplay(move.toRow, move.toCol);
                    }, 250);
                }, 25);
            });
            
            newCells.forEach(newCell => {
                // 移除延迟和闪烁效果，直接更新格子显示
                const cell = gameState.cellElements[newCell.row][newCell.col];
                // 不添加new-cell类，避免闪烁
                updateCellDisplay(newCell.row, newCell.col);
            });
            
            setTimeout(() => {
                if (hasFalling) {
                    applyGravity();
                } else {
                    // 下落完成后检查是否有新的连通组
                    checkForNewConnectedGroups();
                }
            }, 300);
        } else {
            // 如果没有格子下落，也要检查是否有新的连通组
            checkForNewConnectedGroups();
        }
    }
    
    // 下落后检查新连通组
    function checkForNewConnectedGroups() {
        const newGroups = findAllConnectedGroups();
        if (newGroups.length > 0) {
            console.log(`下落后发现${newGroups.length}个新连通组`);
            
            // 给新的连通组添加短暂高亮，提示玩家
            for (const group of newGroups) {
                for (const cell of group) {
                    const cellElement = gameState.cellElements[cell.row][cell.col];
                    cellElement.classList.add('new-connected');
                }
            }
            
            // 短暂延迟后开始处理新连通组
            setTimeout(() => {
                // 移除高亮提示
                document.querySelectorAll('.new-connected').forEach(el => {
                    el.classList.remove('new-connected');
                });
                
                // 依次处理连通组
                processConnectedGroups(-1, -1);
            }, 400);
        } else {
            // 没有新的连通组，结束动画状态
            gameState.isAnimating = false;
            // 保存最终状态
            saveGameState();
        }
    }

    // 使用广度优先搜索找到从起点到终点的路径，避开非空格子
    function findPath(startCell, targetCell) {
        // 定义可以移动的四个方向：上、右、下、左
        const directions = [
            { row: -1, col: 0 }, // 上
            { row: 0, col: 1 },  // 右
            { row: 1, col: 0 },  // 下
            { row: 0, col: -1 }  // 左
        ];
        
        // 创建一个队列，从起点开始
        const queue = [{ row: startCell.row, col: startCell.col, path: [] }];
        
        // 创建一个访问标记数组
        const visited = Array(gameState.boardSize).fill().map(() => Array(gameState.boardSize).fill(false));
        visited[startCell.row][startCell.col] = true;
        
        // 广度优先搜索
        while (queue.length > 0) {
            const current = queue.shift();
            
            // 如果到达目标格子旁边，返回路径
            if ((Math.abs(current.row - targetCell.row) === 1 && current.col === targetCell.col) || 
                (Math.abs(current.col - targetCell.col) === 1 && current.row === targetCell.row)) {
                return [...current.path, { row: current.row, col: current.col }];
            }
            
            // 尝试四个方向
            for (const dir of directions) {
                const newRow = current.row + dir.row;
                const newCol = current.col + dir.col;
                
                // 检查是否在边界内并且未访问过
                if (newRow >= 0 && newRow < gameState.boardSize && 
                    newCol >= 0 && newCol < gameState.boardSize && 
                    !visited[newRow][newCol]) {
                    
                    // 检查新位置是否为空或者是目标格子
                    if (gameState.board[newRow][newCol] === null || 
                        (newRow === targetCell.row && newCol === targetCell.col)) {
                        
                        // 标记为已访问
                        visited[newRow][newCol] = true;
                        
                        // 添加到队列中，并记录路径
                        queue.push({
                            row: newRow,
                            col: newCol,
                            path: [...current.path, { row: current.row, col: current.col }]
                        });
                    }
                }
            }
        }
        
        // 如果找不到路径，返回null
        return null;
    }
    
    // 动画播放路径上的每一步移动
    function animatePath(element, path, finalPos, callback) {
        const duration = 25; // 从50ms再减半到25ms
        let step = 0;
        
        // 获取路径中每个点的实际坐标
        const positions = path.map(point => {
            const cell = gameState.cellElements[point.row][point.col];
            const rect = cell.getBoundingClientRect();
            return {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
        });
        
        // 添加最终位置
        positions.push(finalPos);
        
        // 执行路径动画
        function nextStep() {
            if (step < positions.length) {
                const pos = positions[step];
                const elementWidth = parseInt(element.style.width);
                const elementHeight = parseInt(element.style.height);
                
                element.style.left = `${pos.x - elementWidth / 2}px`;
                element.style.top = `${pos.y - elementHeight / 2}px`;
                
                step++;
                setTimeout(nextStep, duration);
            } else {
                // 到达目标位置后，执行消失动画
                element.classList.add('vanish');
                setTimeout(callback, 80); // 从150ms再减半
            }
        }
        
        // 开始执行动画
        setTimeout(nextStep, 5); // 从10ms减半
    }

    // 检查游戏是否结束并更新记录
    function checkGameEndAndUpdateRecords() {
        // 获取历史记录
        const highestNumber = parseInt(localStorage.getItem('tapmeHighestNumber') || 1);
        const highestScore = parseInt(localStorage.getItem('tapmeHighestScore') || 0);
        
        // 保存破纪录状态供游戏结束弹框使用
        gameState.isNewNumberRecord = gameState.maxNumberInGame > highestNumber;
        gameState.isNewScoreRecord = gameState.score > highestScore;
        
        // 检查并更新最高数字记录
        if (gameState.isNewNumberRecord) {
            localStorage.setItem('tapmeHighestNumber', gameState.maxNumberInGame);
            showNewRecordMessage('新的最高数字记录！');
        }
        
        // 检查并更新最高分记录
        if (gameState.isNewScoreRecord) {
            localStorage.setItem('tapmeHighestScore', gameState.score);
            showNewRecordMessage('新的最高积分记录！');
        }
        
        // 更新显示
        updateRecordsDisplay();
    }
    
    // 显示新记录消息
    function showNewRecordMessage(message) {
        const recordPopup = document.createElement('div');
        recordPopup.classList.add('record-popup');
        recordPopup.textContent = message;
        document.body.appendChild(recordPopup);
        
        setTimeout(() => {
            recordPopup.classList.add('show');
            setTimeout(() => {
                recordPopup.classList.remove('show');
                setTimeout(() => {
                    document.body.removeChild(recordPopup);
                }, 500);
            }, 2000);
        }, 10);
    }

    // 显示游戏结束弹框
    function showGameEndModal() {
        // 创建弹框
        const modal = document.createElement('div');
        modal.id = 'game-end-modal';
        modal.className = 'game-modal';
        
        // 设置弹框内容
        let message = '<h2>游戏结束</h2>';
        
        // 添加游戏结果
        message += `<div class="game-results">
            <p>本局得分: <span class="highlight-text">${gameState.score}</span></p>
            <p>最大数字: <span class="highlight-text">${gameState.maxNumberInGame}</span></p>
        </div>`;
        
        // 如果破纪录，添加恭喜信息
        if (gameState.isNewNumberRecord || gameState.isNewScoreRecord) {
            message += '<div class="congrats">恭喜你打破记录！</div>';
            
            if (gameState.isNewNumberRecord) {
                message += `<p>新的最高数字: <span class="record-text">${gameState.maxNumberInGame}</span></p>`;
            }
            
            if (gameState.isNewScoreRecord) {
                message += `<p>新的最高分数: <span class="record-text">${gameState.score}</span></p>`;
            }
        }
        
        // 添加按钮
        message += '<div class="modal-buttons">'+
            '<button id="modal-restart-btn" class="modal-btn primary-btn">重新开始</button>'+
        '</div>';
        
        modal.innerHTML = message;
        document.body.appendChild(modal);
        
        // 添加按钮事件监听
        setTimeout(() => {
            document.getElementById('modal-restart-btn').addEventListener('click', () => {
                document.body.removeChild(modal);
                localStorage.removeItem('tapmeGameState');
                initGame();
            });
            
            // 添加类以触发显示动画
            modal.classList.add('show');
        }, 10);
    }

    // 显示确认弹框
    function showConfirmModal(title, message, onConfirm) {
        // 创建弹框
        const modal = document.createElement('div');
        modal.id = 'confirm-modal';
        modal.className = 'game-modal';
        
        // 设置弹框内容
        const content = `
            <h2>${title}</h2>
            <div class="modal-message">${message}</div>
            <div class="modal-buttons">
                <button id="modal-cancel-btn" class="modal-btn">取消</button>
                <button id="modal-confirm-btn" class="modal-btn primary-btn">确定</button>
            </div>
        `;
        
        modal.innerHTML = content;
        document.body.appendChild(modal);
        
        // 添加按钮事件监听
        setTimeout(() => {
            document.getElementById('modal-cancel-btn').addEventListener('click', () => {
                document.body.removeChild(modal);
            });
            
            document.getElementById('modal-confirm-btn').addEventListener('click', () => {
                document.body.removeChild(modal);
                if (typeof onConfirm === 'function') {
                    onConfirm();
                }
            });
            
            // 添加类以触发显示动画
            modal.classList.add('show');
        }, 10);
    }
}); 
