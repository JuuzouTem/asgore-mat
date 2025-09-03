//================================================================
// OYUNUN BAŞLATILMASI VE TEMEL DEĞİŞKENLER
//================================================================
document.addEventListener('DOMContentLoaded', () => {

    // Canvas ve Context'i al
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    // Canvas boyutunu kapsayıcısına göre ayarla
    function resizeCanvas() {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); // İlk yüklemede boyutlandır

    // Arayüz (UI) elemanlarını al
    const questionTextEl = document.getElementById('question-text');
    const hpBarEl = document.getElementById('hp-bar');
    const hpTextEl = document.getElementById('hp-text');
    const scoreValueEl = document.getElementById('score-value');
    const currentAnswerTextEl = document.getElementById('current-answer-text');
    const gameOverScreen = document.getElementById('game-over-screen');

    // *** YENİ: ARKA PLAN MÜZİĞİ ***
    const backgroundMusic = new Audio('song/asgore_theme.mp3');
    backgroundMusic.loop = true; // Müziğin sürekli dönmesini sağlar
    backgroundMusic.volume = 0.4; // Ses seviyesini ayarla (0.0 ile 1.0 arası)
    let musicStarted = false; // Müziğin sadece bir kez başlatıldığından emin olmak için

    // Savaş kutusu artık canvas boyutuna göre dinamik
    const battleBox = {
        width: 0,
        height: 180,
        x: 0,
        y: 0,
        updatePosition() {
            this.width = canvas.width * 0.6;
            this.x = (canvas.width - this.width) / 2;
            this.y = canvas.height - this.height - 80;
        }
    };
    battleBox.updatePosition();

    // Görsel varlıklarını yüklemek için bir yönetici
    const assetManager = {
        images: {},
        paths: {
            player: 'img/heart.png',
            boss: 'img/asgore.png',
            projectile: 'img/fireball.png'
        },
        loadAssets(callback) {
            let loadedCount = 0;
            const totalAssets = Object.keys(this.paths).length;
            for (let key in this.paths) {
                const img = new Image();
                img.src = this.paths[key];
                this.images[key] = img;
                img.onload = () => {
                    if (++loadedCount === totalAssets) {
                        callback();
                    }
                };
            }
        }
    };

    //================================================================
    // OYUNCU SINIFI
    //================================================================
    class Player {
        constructor(x, y, image) {
            this.x = x;
            this.y = y;
            this.width = 20;
            this.height = 20;
            this.speed = 4;
            this.image = image;
            this.invincible = false;
            this.invincibilityTimer = 0;
        }

        draw() {
            if (this.invincible && Math.floor(Date.now() / 100) % 2 === 0) {
                return;
            }
            ctx.drawImage(this.image, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        }

        update(keys) {
            if (keys['ArrowUp']) this.y -= this.speed;
            if (keys['ArrowDown']) this.y += this.speed;
            if (keys['ArrowLeft']) this.x -= this.speed;
            if (keys['ArrowRight']) this.x += this.speed;

            this.x = Math.max(battleBox.x + this.width / 2, Math.min(this.x, battleBox.x + battleBox.width - this.width / 2));
            this.y = Math.max(battleBox.y + this.height / 2, Math.min(this.y, battleBox.y + battleBox.height - this.height / 2));
            
            if (this.invincible) {
                this.invincibilityTimer--;
                if (this.invincibilityTimer <= 0) {
                    this.invincible = false;
                }
            }
        }
        
        getHitbox() {
            return { x: this.x - this.width / 2, y: this.y - this.height / 2, width: this.width, height: this.height };
        }

        setInvincible(duration) {
            this.invincible = true;
            this.invincibilityTimer = duration;
        }
    }

    //================================================================
    // MERMİ (ATEŞ TOPU) SINIFI
    //================================================================
    class Projectile {
        constructor(x, y, vx, vy, image) {
            this.x = x;
            this.y = y;
            this.vx = vx;
            this.vy = vy;
            this.width = 50;
            this.height = 47;
            this.image = image;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;
        }

        draw() {
             ctx.save();
             ctx.translate(this.x, this.y);
             ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI / 2);
             ctx.drawImage(this.image, -this.width / 2, -this.height / 2, this.width, this.height);
             ctx.restore();
        }
    }

    //================================================================
    // CEVAP SEÇENEĞİ SINIFI (0-9 ve ENTER)
    //================================================================
    class AnswerOption {
        constructor(value, x, y) {
            this.value = value;
            this.x = x;
            this.y = y;
            this.width = value === 'ENTER' ? 80 : 40;
            this.height = 40;
        }

        draw() {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
            ctx.fillStyle = '#fff';
            ctx.font = "24px 'VT323'";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.value, this.x, this.y);
        }
        
        getHitbox() {
            return { x: this.x - this.width / 2, y: this.y - this.height / 2, width: this.width, height: this.height };
        }
    }
    
    //================================================================
    // OYUN YÖNETİCİSİ (GAME MANAGER)
    //================================================================
    const gameManager = {
        player: null,
        boss: { x: 0, y: 300, image: null },
        projectiles: [],
        answerOptions: [],
        keys: {},
        gameState: 'playing',
        maxHp: 20,
        hp: 20,
        score: 0,
        level: 'Kolay',
        currentQuestion: '',
        correctAnswer: 0,
        playerAnswer: '',
        attackTimer: 120,
        nextTargetOption: null,
        
        init() {
            this.boss.x = canvas.width / 2;
            this.player = new Player(battleBox.x + battleBox.width / 2, battleBox.y + battleBox.height / 2, assetManager.images.player);
            this.boss.image = assetManager.images.boss;
            this.setupEventListeners();
            this.nextQuestion();
        },

        setupEventListeners() {
            window.addEventListener('keydown', (e) => {
                // *** YENİ: MÜZİĞİ BAŞLATMA MANTIĞI ***
                // Kullanıcı herhangi bir tuşa ilk kez bastığında müziği başlat
                if (!musicStarted) {
                    backgroundMusic.play();
                    musicStarted = true;
                }
                this.keys[e.key] = true;
            });
            window.addEventListener('keyup', (e) => {
                this.keys[e.key] = false;
                if (e.key.toLowerCase() === 'z') this.handleSelection();
            });
            window.addEventListener('resize', () => {
                resizeCanvas();
                battleBox.updatePosition();
                this.boss.x = canvas.width / 2;
                this.generateAnswerOptions();
            });
        },
        
        handleSelection() {
            for (const option of this.answerOptions) {
                if (this.checkCollision(this.player.getHitbox(), option.getHitbox())) {
                    if (option.value === 'ENTER') {
                        this.submitAnswer();
                    } else {
                        if (this.playerAnswer.length < 5) {
                           this.playerAnswer += option.value;
                        }
                        this.updateNextTarget();
                    }
                    break;
                }
            }
        },

        submitAnswer() {
            if (this.playerAnswer === '') return;

            if (parseInt(this.playerAnswer) === this.correctAnswer) {
                this.score += 100;

                // Detaylı can yenileme mantığı
                if (this.hp <= this.maxHp * 0.75) {
                    const damageTaken = this.maxHp - this.hp;
                    const healthFactor = damageTaken * 0.60;

                    if (healthFactor >= 1) {
                        if (this.hp <= this.maxHp * 0.25) {
                            this.hp += 4;
                        } else {
                            this.hp += 2;
                        }
                    }
                }
                
                this.hp = Math.min(this.maxHp, this.hp);

            } else {
                this.takeDamage(5); 
            }
            this.playerAnswer = '';
            this.updateDifficulty();
            this.nextQuestion();
        },
        
        updateNextTarget() {
            const answerStr = this.correctAnswer.toString();
            const currentInputLength = this.playerAnswer.length;

            if (currentInputLength >= answerStr.length) {
                this.nextTargetOption = this.answerOptions.find(opt => opt.value === 'ENTER');
            } else {
                const nextDigit = answerStr[currentInputLength];
                this.nextTargetOption = this.answerOptions.find(opt => opt.value === nextDigit);
            }
        },
        
        updateDifficulty() {
            if (this.score >= 1000) this.level = 'Zor';
            else if (this.score >= 400) this.level = 'Orta';
            else this.level = 'Kolay';
        },

        nextQuestion() {
            let num1, num2, num3, operator, operator2;
            switch (this.level) {
                case 'Orta':
                    num1 = Math.floor(Math.random() * 90) + 10;
                    num2 = Math.floor(Math.random() * 9) + 2;
                    operator = ['*', '/'][Math.floor(Math.random() * 2)];
                    if (operator === '/') num1 = num1 * num2;
                    this.currentQuestion = `${num1} ${operator} ${num2} = ?`;
                    this.correctAnswer = Math.round(eval(num1 + operator + num2));
                    break;
                case 'Zor':
                    num1 = Math.floor(Math.random() * 10) + 1;
                    num2 = Math.floor(Math.random() * 10) + 1;
                    num3 = Math.floor(Math.random() * 20) + 1;
                    operator = ['*', '/'][Math.floor(Math.random() * 2)];
                    if (operator === '/') num1 = num1 * num2;
                    operator2 = ['+', '-'][Math.floor(Math.random() * 2)];
                    this.currentQuestion = `(${num1} ${operator} ${num2}) ${operator2} ${num3} = ?`;
                    this.correctAnswer = Math.round(eval(`(${num1} ${operator} ${num2}) ${operator2} ${num3}`));
                    break;
                case 'Kolay':
                default:
                    num1 = Math.floor(Math.random() * 9) + 1;
                    num2 = Math.floor(Math.random() * 9) + 1;
                    operator = ['+', '-'][Math.floor(Math.random() * 2)];
                    if (operator === '-' && num1 < num2) [num1, num2] = [num2, num1];
                    this.currentQuestion = `${num1} ${operator} ${num2} = ?`;
                    this.correctAnswer = eval(num1 + operator + num2);
                    break;
            }
            this.generateAnswerOptions();
            this.updateNextTarget();
        },
        
        generateAnswerOptions() {
            this.answerOptions = [];
            const options = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'ENTER'];
            for (const opt of options) {
                let x, y, validPosition;
                do {
                    validPosition = true;
                    x = battleBox.x + 30 + Math.random() * (battleBox.width - 60);
                    y = battleBox.y + 30 + Math.random() * (battleBox.height - 60);
                    for (const existingOpt of this.answerOptions) {
                        const dist = Math.hypot(x - existingOpt.x, y - existingOpt.y);
                        if (dist < 60) {
                            validPosition = false;
                            break;
                        }
                    }
                } while (!validPosition);
                this.answerOptions.push(new AnswerOption(opt, x, y));
            }
        },
        
        manageAttacks() {
            this.attackTimer--;
            if (this.attackTimer <= 0) {
                const attackChoice = Math.floor(Math.random() * 4);
                switch(attackChoice) {
                    case 0: this.createFirewallAttack(); break;
                    case 1: this.createSpiralAttack(); break;
                    case 2: this.createCrossfireAttack(); break;
                    case 3: this.createRingAttack(); break;
                }
                this.attackTimer = 180 + Math.random() * 60;
            }
        },

        createFirewallAttack() {
            const wallLength = battleBox.height * 0.7;
            const gapSize = battleBox.height - wallLength;
            const gapStart = battleBox.y + Math.random() * gapSize;
            
            const startX = Math.random() > 0.5 ? battleBox.x - 30 : battleBox.x + battleBox.width + 30;
            const vx = (startX < battleBox.x) ? 3 : -3;
            
            for (let y = battleBox.y; y <= battleBox.y + battleBox.height; y += 20) {
                if (y < gapStart || y > gapStart + wallLength) {
                    continue;
                }
                this.projectiles.push(new Projectile(startX, y, vx, 0, assetManager.images.projectile));
            }
        },

        createSpiralAttack() {
            if (!this.nextTargetOption) return;
            const centerX = (this.player.x + this.nextTargetOption.x) / 2;
            const centerY = (this.player.y + this.nextTargetOption.y) / 2;
            
            const numProjectiles = 12;
            const angleStep = (Math.PI * 2) / numProjectiles;
            const speed = 2;
            const rotation = Math.random() > 0.5 ? 1 : -1;

            for (let i = 0; i < numProjectiles * 2; i++) {
                setTimeout(() => {
                    const angle = (i * angleStep) * rotation;
                    const vx = Math.cos(angle) * speed;
                    const vy = Math.sin(angle) * speed;
                    this.projectiles.push(new Projectile(centerX, centerY, vx, vy, assetManager.images.projectile));
                }, i * 30);
            }
        },

        createCrossfireAttack() {
            if (!this.nextTargetOption) return;

            const midX = (this.player.x + this.nextTargetOption.x) / 2;
            const midY = (this.player.y + this.nextTargetOption.y) / 2;
            
            const pathAngle = Math.atan2(this.nextTargetOption.y - this.player.y, this.nextTargetOption.x - this.player.x);
            const crossAngle = pathAngle + Math.PI / 2;
            const speed = 2.5;
            const vx = Math.cos(crossAngle) * speed;
            const vy = Math.sin(crossAngle) * speed;

            for(let i = -2; i <= 2; i++) {
                const spawnX = midX - Math.cos(pathAngle) * (i * 30);
                const spawnY = midY - Math.sin(pathAngle) * (i * 30);
                this.projectiles.push(new Projectile(spawnX, spawnY, vx, vy, assetManager.images.projectile));
            }
        },

        createRingAttack() {
            if (!this.nextTargetOption) return;
            
            const centerX = this.nextTargetOption.x;
            const centerY = this.nextTargetOption.y;
            const numProjectiles = 10;
            const angleStep = (Math.PI * 2) / numProjectiles;
            const speed = 2;

            for (let i = 0; i < numProjectiles; i++) {
                const angle = i * angleStep;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;
                const startX = centerX + Math.cos(angle) * 20;
                const startY = centerY + Math.sin(angle) * 20;
                this.projectiles.push(new Projectile(startX, startY, vx, vy, assetManager.images.projectile));
            }
        },
        
        takeDamage(amount) {
            if (this.player.invincible) return;
            this.hp -= amount;
            this.player.setInvincible(90);
            if (this.hp <= 0) {
                this.hp = 0;
                this.gameState = 'gameOver';
                gameOverScreen.classList.remove('hidden');
            }
        },

        update() {
            if (this.gameState !== 'playing') return;
            this.player.update(this.keys);
            this.manageAttacks();

            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                const p = this.projectiles[i];
                p.update();
                if (this.checkCollision(this.player.getHitbox(), { x: p.x - p.width/2, y: p.y - p.height/2, width: p.width, height: p.height })) {
                    this.takeDamage(1);
                    this.projectiles.splice(i, 1);
                    continue;
                }
                if (p.y > canvas.height + 20 || p.y < -20 || p.x < -20 || p.x > canvas.width + 20) {
                    this.projectiles.splice(i, 1);
                }
            }
        },

        draw() {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const bossWidth = 400;
            const bossHeight = 200;
            ctx.drawImage(this.boss.image, this.boss.x - bossWidth/2, this.boss.y - bossHeight/2, bossWidth, bossHeight);
            
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.strokeRect(battleBox.x, battleBox.y, battleBox.width, battleBox.height);
            this.answerOptions.forEach(opt => opt.draw());
            this.projectiles.forEach(p => p.draw());
            this.player.draw();
        },
        
        updateUI() {
            questionTextEl.textContent = `* ${this.currentQuestion}`;
            scoreValueEl.textContent = this.score;
            hpTextEl.textContent = `${this.hp} / ${this.maxHp}`;
            hpBarEl.style.width = `${(this.hp / this.maxHp) * 100}%`;
            currentAnswerTextEl.textContent = this.playerAnswer;
        },
        
        checkCollision(rect1, rect2) {
            return rect1.x < rect2.x + rect2.width &&
                   rect1.x + rect1.width > rect2.x &&
                   rect1.y < rect2.y + rect2.height &&
                   rect1.y + rect1.height > rect2.y;
        }
    };

    //================================================================
    // OYUN DÖNGÜSÜ (GAME LOOP)
    //================================================================
    function gameLoop() {
        gameManager.update();
        gameManager.draw();
        gameManager.updateUI();
        if (gameManager.gameState === 'playing') {
            requestAnimationFrame(gameLoop);
        }
    }

    assetManager.loadAssets(() => {
        gameManager.init();
        gameLoop();
    });

});
