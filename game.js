const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game state
const game = {
    ball: { x: 100, y: 300, vx: 0, vy: 0, z: 0, vz: 0, radius: 4 },
    hole: { x: 700, y: 300, radius: 8 },
    tee: { x: 100, y: 300 },
    powerMeter: { charging: false, power: 0, maxPower: 20 },
    strokes: 0,
    isMoving: false,
    won: false,
    golfer: { x: 100, y: 300, swinging: false, swingFrame: 0 },
    inAir: false
};

// Course obstacles
const obstacles = {
    sandTraps: [
        { x: 300, y: 200, width: 80, height: 60 },
        { x: 500, y: 350, width: 70, height: 50 }
    ],
    trees: [
        { x: 250, y: 150, radius: 15 },
        { x: 400, y: 450, radius: 15 },
        { x: 550, y: 180, radius: 15 }
    ],
    slopes: [
        { x: 400, y: 280, width: 100, height: 80, direction: { x: 0, y: 0.3 } }
    ]
};

const FRICTION = 0.98;
const SAND_FRICTION = 0.85;
const MIN_VELOCITY = 0.1;
const GRAVITY = 0.3;
const GREEN_RADIUS = 80;

// Mouse handling
let mouseDown = false;
let mousePos = { x: 0, y: 0 };

canvas.addEventListener('mousedown', (e) => {
    if (!game.isMoving && !game.won) {
        const rect = canvas.getBoundingClientRect();
        mousePos.x = e.clientX - rect.left;
        mousePos.y = e.clientY - rect.top;
        mouseDown = true;
        game.powerMeter.charging = true;
        game.powerMeter.power = 0;
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (mouseDown && game.powerMeter.charging) {
        shoot();
        mouseDown = false;
        game.powerMeter.charging = false;
    }
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;
});

function shoot() {
    const dx = game.ball.x - mousePos.x;
    const dy = game.ball.y - mousePos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
        const power = game.powerMeter.power;
        
        // Check if on green (putting)
        const distToHole = Math.sqrt(
            (game.ball.x - game.hole.x) ** 2 + 
            (game.ball.y - game.hole.y) ** 2
        );
        const onGreen = distToHole < GREEN_RADIUS;
        
        if (onGreen) {
            // Putting - ball rolls on ground
            game.ball.vx = (dx / distance) * power;
            game.ball.vy = (dy / distance) * power;
            game.ball.z = 0;
            game.ball.vz = 0;
            game.inAir = false;
        } else {
            // Full shot - ball flies through air (slower horizontal speed)
            game.ball.vx = (dx / distance) * power * 0.6;
            game.ball.vy = (dy / distance) * power * 0.6;
            game.ball.z = 0;
            game.ball.vz = power * 0.8; // Launch angle
            game.inAir = true;
        }
        
        game.isMoving = true;
        game.strokes++;
        game.golfer.swinging = true;
        game.golfer.swingFrame = 0;
        updateUI();
    }
}

function update() {
    // Charge power meter (loops back to 0 when it reaches max)
    if (game.powerMeter.charging) {
        game.powerMeter.power += 0.3;
        if (game.powerMeter.power > game.powerMeter.maxPower) {
            game.powerMeter.power = 0;
        }
    }
    
    // Update swing animation
    if (game.golfer.swinging) {
        game.golfer.swingFrame++;
        if (game.golfer.swingFrame > 15) {
            game.golfer.swinging = false;
        }
    }
    
    // Update golfer position to follow ball
    if (!game.isMoving && !game.won) {
        game.golfer.x = game.ball.x;
        game.golfer.y = game.ball.y;
    }
    
    // Update ball physics
    if (game.isMoving) {
        game.ball.x += game.ball.vx;
        game.ball.y += game.ball.vy;
        
        // Update flight physics
        if (game.inAir) {
            game.ball.z += game.ball.vz;
            game.ball.vz -= GRAVITY;
            
            // Ball lands
            if (game.ball.z <= 0) {
                game.ball.z = 0;
                game.inAir = false;
                // Reduce velocity on landing
                game.ball.vx *= 0.6;
                game.ball.vy *= 0.6;
            }
        }
        
        // Only check obstacles when ball is on ground
        if (!game.inAir) {
            // Check if ball is in sand trap
            let inSand = false;
            for (const sand of obstacles.sandTraps) {
                if (game.ball.x > sand.x && game.ball.x < sand.x + sand.width &&
                    game.ball.y > sand.y && game.ball.y < sand.y + sand.height) {
                    inSand = true;
                    break;
                }
            }
            
            // Check if ball is on slope
            for (const slope of obstacles.slopes) {
                if (game.ball.x > slope.x && game.ball.x < slope.x + slope.width &&
                    game.ball.y > slope.y && game.ball.y < slope.y + slope.height) {
                    game.ball.vx += slope.direction.x;
                    game.ball.vy += slope.direction.y;
                }
            }
            
            // Apply friction (more in sand)
            const currentFriction = inSand ? SAND_FRICTION : FRICTION;
            game.ball.vx *= currentFriction;
            game.ball.vy *= currentFriction;
            
            // Check tree collisions (only when on ground)
            for (const tree of obstacles.trees) {
                const dx = game.ball.x - tree.x;
                const dy = game.ball.y - tree.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < tree.radius + game.ball.radius) {
                    // Bounce off tree
                    const angle = Math.atan2(dy, dx);
                    game.ball.vx = Math.cos(angle) * Math.abs(game.ball.vx) * 0.5;
                    game.ball.vy = Math.sin(angle) * Math.abs(game.ball.vy) * 0.5;
                    game.ball.x = tree.x + Math.cos(angle) * (tree.radius + game.ball.radius);
                    game.ball.y = tree.y + Math.sin(angle) * (tree.radius + game.ball.radius);
                }
            }
        }
        
        // Stop if velocity is too low and on ground
        if (!game.inAir && Math.abs(game.ball.vx) < MIN_VELOCITY && Math.abs(game.ball.vy) < MIN_VELOCITY) {
            game.ball.vx = 0;
            game.ball.vy = 0;
            game.isMoving = false;
        }
        
        // Boundary collision
        if (game.ball.x - game.ball.radius < 0 || game.ball.x + game.ball.radius > canvas.width) {
            game.ball.vx *= -0.7;
            game.ball.x = Math.max(game.ball.radius, Math.min(canvas.width - game.ball.radius, game.ball.x));
        }
        if (game.ball.y - game.ball.radius < 0 || game.ball.y + game.ball.radius > canvas.height) {
            game.ball.vy *= -0.7;
            game.ball.y = Math.max(game.ball.radius, Math.min(canvas.height - game.ball.radius, game.ball.y));
        }
    }
    
    // Check if ball is in hole
    const dx = game.ball.x - game.hole.x;
    const dy = game.ball.y - game.hole.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < game.hole.radius - game.ball.radius && !game.inAir) {
        game.ball.vx = 0;
        game.ball.vy = 0;
        game.ball.x = game.hole.x;
        game.ball.y = game.hole.y;
        game.ball.z = 0;
        game.isMoving = false;
        game.won = true;
        updateUI();
    }
}

function draw() {
    // Clear canvas
    ctx.fillStyle = '#4a7c2c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw fairway (lighter green path)
    ctx.fillStyle = '#5a9c3c';
    ctx.fillRect(50, 250, 700, 100);
    
    // Draw sand traps
    ctx.fillStyle = '#E8D4A0';
    for (const sand of obstacles.sandTraps) {
        ctx.fillRect(sand.x, sand.y, sand.width, sand.height);
        // Add texture dots
        ctx.fillStyle = '#D4C090';
        for (let i = 0; i < 20; i++) {
            const dotX = sand.x + Math.random() * sand.width;
            const dotY = sand.y + Math.random() * sand.height;
            ctx.fillRect(dotX, dotY, 2, 2);
        }
        ctx.fillStyle = '#E8D4A0';
    }
    
    // Draw slopes (darker green with lines)
    ctx.fillStyle = '#4a8c3c';
    for (const slope of obstacles.slopes) {
        ctx.fillRect(slope.x, slope.y, slope.width, slope.height);
        // Add slope lines
        ctx.strokeStyle = '#3a7c2c';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(slope.x, slope.y + (i * slope.height / 4));
            ctx.lineTo(slope.x + slope.width, slope.y + (i * slope.height / 4) + 10);
            ctx.stroke();
        }
    }
    
    // Draw tee box
    ctx.fillStyle = '#6aac4c';
    ctx.fillRect(50, 270, 80, 60);
    // Tee markers
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(55, 275, 4, 4);
    ctx.fillRect(55, 321, 4, 4);
    
    // Draw trees
    for (const tree of obstacles.trees) {
        // Tree trunk
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(tree.x - 3, tree.y - 5, 6, 10);
        // Tree foliage
        ctx.fillStyle = '#2d5016';
        ctx.beginPath();
        ctx.arc(tree.x, tree.y - 8, tree.radius, 0, Math.PI * 2);
        ctx.fill();
        // Lighter green highlight
        ctx.fillStyle = '#3a6c1c';
        ctx.beginPath();
        ctx.arc(tree.x - 4, tree.y - 10, 6, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Draw green
    ctx.fillStyle = '#3a6c2c';
    ctx.beginPath();
    ctx.arc(game.hole.x, game.hole.y, GREEN_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw hole
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(game.hole.x, game.hole.y, game.hole.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw flag
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(game.hole.x, game.hole.y);
    ctx.lineTo(game.hole.x, game.hole.y - 30);
    ctx.stroke();
    
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.moveTo(game.hole.x, game.hole.y - 30);
    ctx.lineTo(game.hole.x + 15, game.hole.y - 23);
    ctx.lineTo(game.hole.x, game.hole.y - 16);
    ctx.fill();
    
    // Draw ball shadow (when in air)
    if (game.inAir && game.ball.z > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        const shadowSize = game.ball.radius * (1 + game.ball.z / 50);
        ctx.beginPath();
        ctx.ellipse(game.ball.x, game.ball.y, shadowSize, shadowSize * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Draw ball
    if (!game.golfer.swinging || game.golfer.swingFrame > 5) {
        const ballY = game.ball.y - game.ball.z;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(game.ball.x, ballY, game.ball.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Add highlight to show 3D effect
        if (game.ball.z > 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.beginPath();
            ctx.arc(game.ball.x - 1, ballY - 1, game.ball.radius * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    // Draw golfer (only when ball is not moving or just hit)
    if (!game.isMoving || game.golfer.swinging) {
        drawGolfer();
    }
    
    // Draw aim line and power meter when charging
    if (game.powerMeter.charging) {
        const dx = game.ball.x - mousePos.x;
        const dy = game.ball.y - mousePos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            // Aim line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(game.ball.x, game.ball.y);
            ctx.lineTo(game.ball.x + (dx / distance) * 100, game.ball.y + (dy / distance) * 100);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Power meter (below golfer)
            const meterWidth = 100;
            const meterHeight = 20;
            const meterX = game.golfer.x - meterWidth / 2;
            const meterY = game.golfer.y + 25;
            
            ctx.fillStyle = '#333';
            ctx.fillRect(meterX, meterY, meterWidth, meterHeight);
            
            const powerPercent = game.powerMeter.power / game.powerMeter.maxPower;
            ctx.fillStyle = powerPercent < 0.5 ? '#4CAF50' : powerPercent < 0.8 ? '#FFC107' : '#F44336';
            ctx.fillRect(meterX, meterY, meterWidth * powerPercent, meterHeight);
            
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(meterX, meterY, meterWidth, meterHeight);
        }
    }
}

function drawGolfer() {
    const x = game.golfer.x;
    const y = game.golfer.y;
    const swingProgress = game.golfer.swinging ? game.golfer.swingFrame / 15 : 0;
    
    // Body (blue shirt)
    ctx.fillStyle = '#4169E1';
    ctx.fillRect(x - 3, y - 8, 6, 8);
    
    // Head (skin tone)
    ctx.fillStyle = '#FFD4A3';
    ctx.fillRect(x - 2, y - 12, 4, 4);
    
    // Hat
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(x - 3, y - 14, 6, 2);
    
    // Legs
    ctx.fillStyle = '#2C3E50';
    ctx.fillRect(x - 3, y, 2, 6);
    ctx.fillRect(x + 1, y, 2, 6);
    
    // Golf club
    if (game.golfer.swinging) {
        // Swing animation
        if (swingProgress < 0.3) {
            // Backswing
            ctx.strokeStyle = '#8B4513';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y - 4);
            ctx.lineTo(x - 8, y - 12);
            ctx.stroke();
            // Club head
            ctx.fillStyle = '#C0C0C0';
            ctx.fillRect(x - 10, y - 13, 3, 2);
        } else if (swingProgress < 0.6) {
            // Downswing
            ctx.strokeStyle = '#8B4513';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y - 4);
            ctx.lineTo(x + 2, y + 4);
            ctx.stroke();
            // Club head
            ctx.fillStyle = '#C0C0C0';
            ctx.fillRect(x + 1, y + 4, 3, 2);
        } else {
            // Follow through
            ctx.strokeStyle = '#8B4513';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y - 4);
            ctx.lineTo(x + 8, y - 8);
            ctx.stroke();
            // Club head
            ctx.fillStyle = '#C0C0C0';
            ctx.fillRect(x + 8, y - 9, 3, 2);
        }
    } else {
        // Resting position
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x - 4, y + 6);
        ctx.stroke();
        // Club head
        ctx.fillStyle = '#C0C0C0';
        ctx.fillRect(x - 6, y + 6, 3, 2);
    }
}

function updateUI() {
    document.getElementById('strokes').textContent = game.strokes;
    const status = document.getElementById('status');
    
    if (game.won) {
        const par = 3;
        const diff = game.strokes - par;
        let message = '';
        if (diff === -2) message = 'Eagle! 🦅';
        else if (diff === -1) message = 'Birdie! 🐦';
        else if (diff === 0) message = 'Par! ⛳';
        else if (diff === 1) message = 'Bogey';
        else message = 'Complete!';
        status.textContent = message + ' - Refresh to play again';
    } else if (game.inAir) {
        status.textContent = 'Ball in flight...';
    } else if (game.isMoving) {
        status.textContent = 'Ball rolling...';
    } else {
        const distToHole = Math.sqrt(
            (game.ball.x - game.hole.x) ** 2 + 
            (game.ball.y - game.hole.y) ** 2
        );
        const onGreen = distToHole < GREEN_RADIUS;
        status.textContent = onGreen ? 'On the green - Click to putt' : 'Click and hold to set power';
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Start game
gameLoop();
