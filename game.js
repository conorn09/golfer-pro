const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game state
const game = {
    ball: { x: 100, y: 300, vx: 0, vy: 0, z: 0, vz: 0, radius: 4 },
    hole: { x: 700, y: 300, radius: 8 },
    tee: { x: 100, y: 300 },
    powerMeter: { 
        active: false, 
        position: 0, 
        speed: 2,
        perfectZoneStart: 75,
        perfectZoneEnd: 85,
        maxPosition: 100
    },
    targetPos: { x: 0, y: 0, set: false },
    strokes: 0,
    isMoving: false,
    won: false,
    golfer: { x: 100, y: 300, swinging: false, swingFrame: 0 },
    inAir: false,
    selectedClub: 0,
    currentCourse: 1,
    par: 3,
    camera: { x: 0, y: 0 },
    flagWave: 0, // For flag animation
    windSway: 0, // For tree sway animation
    leafSpawnTimer: 0, // Timer for spawning new falling leaves
    lastBallPos: { x: 100, y: 300 }, // Last position before shot (for water drops)
    waterPenalty: false, // Show water penalty message
    waterPenaltyTimer: 0,
    wind: { // Wind system that affects ball flight
        speed: 0, // mph
        direction: 0, // radians (0 = right, PI/2 = down, PI = left, 3PI/2 = up)
        maxSpeed: 5 // Max wind speed for current course
    },
    windGust: { // Visual wind gusts for trees
        strength: 0,
        direction: 0,
        phase: 0,
        nextGustTimer: 0
    }
};

// Club definitions
const clubs = [
    { name: 'Putter', maxPower: 8, distance: 50, loft: 0 },
    { name: 'Sand Wedge', maxPower: 12, distance: 80, loft: 1.2 },
    { name: '7 Iron', maxPower: 16, distance: 150, loft: 0.9 },
    { name: 'Driver', maxPower: 20, distance: 250, loft: 0.7 }
];

// Course obstacles - will be loaded based on current course
let obstacles = {};

const FRICTION = 0.98;
const SAND_FRICTION = 0.85;
const MIN_VELOCITY = 0.1;
const GRAVITY = 0.15; // Reduced for slower, more visible ball flight
let GREEN_RADIUS = 80;
const ZOOM = 2; // 2x zoom
const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;

// Static texture patterns (generated once)
const grassTexture = [];
const fairwayTexture = [];
const greenTexture = [];
const sandTextures = [[], []];
const fallenLeaves = [];
const fallingLeaves = []; // Animated falling leaves

// Generate static textures
for (let i = 0; i < 600; i++) {
    grassTexture.push({ 
        x: Math.random() * 800, 
        y: Math.random() * 600,
        height: 3 + Math.random() * 5, // Varied tall grass
        lean: (Math.random() - 0.5) * 3, // Lean direction
        shade: Math.random() // For color variation
    });
}
for (let i = 0; i < 200; i++) {
    fairwayTexture.push({ x: 50 + Math.random() * 700, y: 250 + Math.random() * 100 });
}
for (let i = 0; i < 80; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * GREEN_RADIUS;
    greenTexture.push({ 
        x: 700 + Math.cos(angle) * radius, 
        y: 300 + Math.sin(angle) * radius 
    });
}

// Fallen leaves scattered around
for (let i = 0; i < 60; i++) {
    fallenLeaves.push({
        x: Math.random() * 800,
        y: Math.random() * 600,
        color: Math.random() > 0.5 ? '#8B4513' : (Math.random() > 0.5 ? '#A0522D' : '#CD853F'),
        size: Math.random() > 0.5 ? 2 : 3,
        rotation: Math.random() * Math.PI * 2
    });
}

// Pixel-art water ripple system
const waterRipplePool = [];
const MAX_RIPPLES_PER_HAZARD = 10;
const RIPPLE_LIGHT = '#5EA8F0'; // Lighter shade of water
const RIPPLE_BRIGHT = '#72B8F8'; // Brightest highlight

function initRipple(hazardIndex) {
    return {
        hazardIndex: hazardIndex,
        x: 0, y: 0,           // Position (set when spawned)
        frame: 0,              // Current animation frame
        totalFrames: 50 + Math.floor(Math.random() * 70), // 50-120 frames (~0.8-2s)
        delay: Math.floor(Math.random() * 60), // Stagger start
        size: 4 + Math.floor(Math.random() * 5), // 4-8 pixel radius
        type: Math.floor(Math.random() * 3), // 0=oval, 1=broken arc, 2=streak
        active: false
    };
}

// Pre-create ripple pool (support up to 100 hazard indices for island water)
for (let h = 0; h < 100; h++) {
    for (let r = 0; r < MAX_RIPPLES_PER_HAZARD; r++) {
        waterRipplePool.push(initRipple(h));
    }
}

function spawnRipple(ripple, waterPoints) {
    // Find a random point inside the water polygon
    const minX = Math.min(...waterPoints.map(p => p.x)) + 8;
    const maxX = Math.max(...waterPoints.map(p => p.x)) - 8;
    const minY = Math.min(...waterPoints.map(p => p.y)) + 8;
    const maxY = Math.max(...waterPoints.map(p => p.y)) - 8;
    
    // Try random positions until inside polygon
    for (let attempt = 0; attempt < 10; attempt++) {
        const px = minX + Math.floor(Math.random() * (maxX - minX));
        const py = minY + Math.floor(Math.random() * (maxY - minY));
        
        // Point-in-polygon check
        let inside = false;
        for (let i = 0, j = waterPoints.length - 1; i < waterPoints.length; j = i++) {
            const xi = waterPoints[i].x, yi = waterPoints[i].y;
            const xj = waterPoints[j].x, yj = waterPoints[j].y;
            const intersect = ((yi > py) !== (yj > py))
                && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        if (inside) {
            ripple.x = px;
            ripple.y = py;
            ripple.frame = 0;
            ripple.delay = Math.floor(Math.random() * 40);
            ripple.totalFrames = 50 + Math.floor(Math.random() * 70);
            ripple.size = 4 + Math.floor(Math.random() * 5);
            ripple.type = Math.floor(Math.random() * 3);
            ripple.active = true;
            return;
        }
    }
}

function updateAndDrawRipples(ctx, hazardIndex, waterPoints) {
    const ripples = waterRipplePool.filter(r => r.hazardIndex === hazardIndex);
    let activeCount = ripples.filter(r => r.active).length;
    
    // Spawn new ripples if needed (more active, more frequent)
    for (const ripple of ripples) {
        if (!ripple.active && activeCount < 5 + Math.floor(Math.random() * 4)) {
            if (Math.random() < 0.06) { // Higher chance per frame = more ripples
                spawnRipple(ripple, waterPoints);
                activeCount++;
            }
        }
    }
    
    // Clip to water polygon
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(waterPoints[0].x, waterPoints[0].y);
    for (let i = 1; i < waterPoints.length; i++) {
        ctx.lineTo(waterPoints[i].x, waterPoints[i].y);
    }
    ctx.closePath();
    ctx.clip();
    
    // Turn off smoothing for pixel-perfect rendering
    ctx.imageSmoothingEnabled = false;
    
    for (const ripple of ripples) {
        if (!ripple.active) continue;
        
        // Handle delay
        if (ripple.delay > 0) {
            ripple.delay--;
            continue;
        }
        
        ripple.frame++;
        
        // Calculate lifecycle progress (0 to 1)
        const progress = ripple.frame / ripple.totalFrames;
        
        if (progress >= 1) {
            ripple.active = false;
            continue;
        }
        
        // Fade: appear, hold, fade out
        let visible = true;
        if (progress < 0.15) {
            visible = Math.floor(progress / 0.15 * 3) % 2 === 0; // Flicker in
        } else if (progress > 0.75) {
            visible = Math.floor((1 - progress) / 0.25 * 3) % 2 === 0; // Flicker out
        }
        if (!visible) continue;
        
        // Size grows slightly over lifetime
        const currentSize = Math.floor(ripple.size * (0.6 + progress * 0.4));
        const rx = Math.floor(ripple.x);
        const ry = Math.floor(ripple.y);
        
        // Choose color based on progress
        const color = progress < 0.5 ? RIPPLE_BRIGHT : RIPPLE_LIGHT;
        ctx.fillStyle = color;
        
        if (ripple.type === 0) {
            // Pixel oval highlight - top arc only
            const w = currentSize;
            const h = Math.max(1, Math.floor(currentSize * 0.4));
            // Draw pixel arc (top half of an oval)
            for (let px = -w; px <= w; px++) {
                const edgeY = Math.floor(h * Math.sqrt(1 - (px * px) / (w * w)));
                if (edgeY > 0) {
                    ctx.fillRect(rx + px, ry - edgeY, 1, 1); // Top pixel
                }
            }
        } else if (ripple.type === 1) {
            // Broken arc - scattered pixels in arc shape
            const w = currentSize;
            for (let px = -w; px <= w; px += 2) {
                const edgeY = Math.floor(currentSize * 0.3 * Math.sqrt(1 - (px * px) / (w * w)));
                if (edgeY > 0) {
                    ctx.fillRect(rx + px, ry - edgeY, 1, 1);
                }
            }
            // Bottom arc fragments
            for (let px = -w + 1; px <= w - 1; px += 3) {
                const edgeY = Math.floor(currentSize * 0.3 * Math.sqrt(1 - (px * px) / (w * w)));
                if (edgeY > 0) {
                    ctx.fillRect(rx + px, ry + edgeY, 1, 1);
                }
            }
        } else {
            // Horizontal streak highlight
            const w = currentSize;
            ctx.fillRect(rx - Math.floor(w / 2), ry, w, 1);
            if (currentSize > 5) {
                ctx.fillRect(rx - Math.floor(w / 3), ry + 2, Math.floor(w * 0.5), 1);
            }
        }
    }
    
    ctx.restore();
}

// Mouse handling
let mousePos = { x: 0, y: 0 };
let aimingMode = false; // Track if we're in aiming mode (before power meter)
let mapMode = false; // Track if we're in map viewing mode
let isDragging = false; // Track if we're dragging the map in map mode
let dragStart = { x: 0, y: 0 };
let cameraOffset = { x: 0, y: 0 }; // Manual camera offset from dragging

// M key to toggle map mode, A/D or Arrow keys to switch clubs
document.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
        if (!game.isMoving) {
            mapMode = !mapMode;
            if (!mapMode) {
                // Snap camera back to ball
                cameraOffset.x = 0;
                cameraOffset.y = 0;
            }
            aimingMode = false;
        }
    }
    if ((e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') && !game.isMoving && !game.won) {
        game.selectedClub = (game.selectedClub - 1 + clubs.length) % clubs.length;
    }
    if ((e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') && !game.isMoving && !game.won) {
        game.selectedClub = (game.selectedClub + 1) % clubs.length;
    }
});

canvas.addEventListener('mousedown', (e) => {
    // In map mode, start dragging
    if (mapMode) {
        isDragging = true;
        dragStart.x = e.clientX;
        dragStart.y = e.clientY;
        return;
    }
    
    if (!game.isMoving && !game.won) {
        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        
        // Check if clicking club selector box
        const clubBoxX = 10;
        const clubBoxY = canvas.height - 120;
        const clubBoxWidth = 200;
        const clubBoxHeight = 100;
        
        if (screenY > clubBoxY && screenY < clubBoxY + clubBoxHeight &&
            screenX > clubBoxX && screenX < clubBoxX + clubBoxWidth) {
            // Click is inside club selector box
            if (screenX > clubBoxX + 5 && screenX < clubBoxX + 40) {
                // Left arrow area
                game.selectedClub = (game.selectedClub - 1 + clubs.length) % clubs.length;
                return;
            } else if (screenX > clubBoxX + clubBoxWidth - 40 && screenX < clubBoxX + clubBoxWidth - 5) {
                // Right arrow area
                game.selectedClub = (game.selectedClub + 1) % clubs.length;
                return;
            }
            // Click is in club box but not on arrows - ignore it
            return;
        }
        
        // First click: confirm target and start power meter
        if (!game.powerMeter.active) {
            // Use the already-clamped mousePos from the aiming preview
            // (not re-converted from screen coords, which can shift)
            game.targetPos.x = mousePos.x;
            game.targetPos.y = mousePos.y;
            game.targetPos.set = true;
            game.powerMeter.active = true;
            game.powerMeter.position = 0;
            aimingMode = false; // Exit aiming mode
        }
        // Second click: hit the ball based on power meter position
        else if (game.powerMeter.active) {
            shoot();
            game.powerMeter.active = false;
            game.targetPos.set = false;
        }
    }
});

canvas.addEventListener('mouseup', (e) => {
    isDragging = false;
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    // Handle map dragging in map mode
    if (mapMode && isDragging) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        cameraOffset.x -= dx / ZOOM;
        cameraOffset.y -= dy / ZOOM;
        dragStart.x = e.clientX;
        dragStart.y = e.clientY;
        return;
    }
    
    // Don't update aiming in map mode
    if (mapMode) return;
    
    // Check if mouse is over club selector box
    const clubBoxX = 10;
    const clubBoxY = canvas.height - 120;
    const clubBoxWidth = 200;
    const clubBoxHeight = 100;
    const mouseOverClubBox = screenX >= clubBoxX && screenX <= clubBoxX + clubBoxWidth &&
                             screenY >= clubBoxY && screenY <= clubBoxY + clubBoxHeight;
    
    // Convert screen coordinates to world coordinates
    const rawX = (screenX / ZOOM) + game.camera.x;
    const rawY = (screenY / ZOOM) + game.camera.y;
    
    // Limit mouse position based on club distance
    if (!game.isMoving && !game.won && !game.powerMeter.active) {
        const club = clubs[game.selectedClub];
        const dx = rawX - game.ball.x;
        const dy = rawY - game.ball.y;
        const distanceToMouse = Math.sqrt(dx * dx + dy * dy);
        
        if (distanceToMouse > club.distance) {
            // Clamp to max club distance
            const angle = Math.atan2(dy, dx);
            mousePos.x = game.ball.x + Math.cos(angle) * club.distance;
            mousePos.y = game.ball.y + Math.sin(angle) * club.distance;
        } else {
            mousePos.x = rawX;
            mousePos.y = rawY;
        }
        // Only show aiming mode if mouse is NOT over club selector
        aimingMode = !mouseOverClubBox;
    } else {
        mousePos.x = rawX;
        mousePos.y = rawY;
    }
});

function shoot() {
    const club = clubs[game.selectedClub];
    const dx = game.targetPos.x - game.ball.x;
    const dy = game.targetPos.y - game.ball.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
        // Calculate accuracy based on power meter position
        const meterPos = game.powerMeter.position;
        const perfectStart = game.powerMeter.perfectZoneStart;
        const perfectEnd = game.powerMeter.perfectZoneEnd;
        
        let accuracy = 1.0;
        let angleError = 0;
        
        if (meterPos >= perfectStart && meterPos <= perfectEnd) {
            // Perfect shot!
            accuracy = 1.0;
            angleError = 0;
        } else {
            // Calculate how far off from perfect zone
            let distanceFromPerfect;
            if (meterPos < perfectStart) {
                distanceFromPerfect = perfectStart - meterPos;
                angleError = -distanceFromPerfect * 0.01; // Miss left
            } else {
                distanceFromPerfect = meterPos - perfectEnd;
                angleError = distanceFromPerfect * 0.01; // Miss right
            }
            accuracy = Math.max(0.7, 1.0 - distanceFromPerfect * 0.005);
        }
        
        // Calculate base angle to target
        const baseAngle = Math.atan2(dy, dx);
        // Add error based on accuracy
        const actualAngle = baseAngle + angleError;
        
        // Calculate power based on distance and club
        const targetDistance = Math.min(distance, club.distance);
        const power = (targetDistance / club.distance) * club.maxPower * accuracy;
        
        // Check if on green (putting)
        const distToHole = Math.sqrt(
            (game.ball.x - game.hole.x) ** 2 + 
            (game.ball.y - game.hole.y) ** 2
        );
        const onGreen = distToHole < GREEN_RADIUS;
        
        const powerMultiplier = club.distance / club.maxPower;
        
        if (onGreen || club.name === 'Putter') {
            // Putting - ball rolls on ground (normal fairway speed)
            const putterSpeed = power * (powerMultiplier / 12);
            game.ball.vx = Math.cos(actualAngle) * putterSpeed;
            game.ball.vy = Math.sin(actualAngle) * putterSpeed;
            game.ball.z = 0;
            game.ball.vz = 0;
            game.inAir = false;
        } else {
            // Full shot - ball flies through air (reduced speed for better distance control)
            const shotSpeed = power * (powerMultiplier / 55);
            game.ball.vx = Math.cos(actualAngle) * shotSpeed;
            game.ball.vy = Math.sin(actualAngle) * shotSpeed;
            game.ball.z = 0;
            game.ball.vz = power * club.loft * 0.35;
            game.inAir = true;
        }
        
        game.isMoving = true;
        game.strokes++;
        game.waterPenalty = false;
        game.lastBallPos.x = game.ball.x;
        game.lastBallPos.y = game.ball.y;
        game.golfer.swinging = true;
        game.golfer.swingFrame = 0;
        updateUI();
    }
}

function update() {
    // Update camera
    if (mapMode) {
        // Manual camera position (map viewing mode)
        game.camera.x = game.ball.x - (canvas.width / ZOOM) / 2 + cameraOffset.x;
        game.camera.y = game.ball.y - (canvas.height / ZOOM) / 2 + cameraOffset.y;
    } else if (game.isMoving) {
        // Camera follows ball when moving, reset offset
        cameraOffset.x = 0;
        cameraOffset.y = 0;
        game.camera.x = game.ball.x - (canvas.width / ZOOM) / 2;
        game.camera.y = game.ball.y - (canvas.height / ZOOM) / 2;
    } else {
        // Camera follows ball normally
        game.camera.x = game.ball.x - (canvas.width / ZOOM) / 2 + cameraOffset.x;
        game.camera.y = game.ball.y - (canvas.height / ZOOM) / 2 + cameraOffset.y;
    }
    
    // Clamp camera to world bounds
    game.camera.x = Math.max(0, Math.min(WORLD_WIDTH - canvas.width / ZOOM, game.camera.x));
    game.camera.y = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height / ZOOM, game.camera.y));
    
    // Update flag wave animation
    game.flagWave += 0.1;
    
    // Update realistic wind system
    game.windSway += 0.02;
    
    // Wind gust system - synced with main wind direction
    game.windGust.nextGustTimer--;
    if (game.windGust.nextGustTimer <= 0) {
        // Start a new gust - use main wind direction with slight variation
        game.windGust.strength = (game.wind.speed / game.wind.maxSpeed) * 1.5; // Strength based on wind speed
        game.windGust.direction = game.wind.direction + (Math.random() - 0.5) * 0.3; // Slight variation
        game.windGust.phase = 0;
        game.windGust.nextGustTimer = 120 + Math.random() * 180; // Next gust in 2-5 seconds
    }
    
    // Update gust phase (travels across course)
    if (game.windGust.phase < Math.PI * 2) {
        game.windGust.phase += 0.03;
    }
    
    // Apply wind to ball when in air
    if (game.inAir && game.ball.z > 0) {
        // Wind affects ball more when higher in the air
        const windEffect = (game.ball.z / 50) * (game.wind.speed / 10); // Scale wind effect
        game.ball.vx += Math.cos(game.wind.direction) * windEffect * 0.02;
        game.ball.vy += Math.sin(game.wind.direction) * windEffect * 0.02;
    }
    
    // Update falling leaves (only for forest course) - 2x more
    if (game.currentCourse === 1) {
        // Spawn new leaves much more frequently - 4x total increase from original
        game.leafSpawnTimer++;
        if (game.leafSpawnTimer > 8 && fallingLeaves.length < 100) { // Spawn every ~0.13 seconds, max 100 leaves (4x original)
            game.leafSpawnTimer = 0;
            if (Math.random() > 0.1 && obstacles.trees) { // 90% chance
                // Pick a random tree
                const tree = obstacles.trees[Math.floor(Math.random() * obstacles.trees.length)];
                if (tree.type === 'forest') {
                    // Leaves are affected by wind when spawned
                    const windEffect = Math.cos(game.wind.direction) * (game.wind.speed / 10) * 0.5;
                    const windEffectY = Math.sin(game.wind.direction) * (game.wind.speed / 10) * 0.5;
                    fallingLeaves.push({
                        x: tree.x + (Math.random() - 0.5) * 20,
                        y: tree.y - 20 + (Math.random() - 0.5) * 10,
                        vx: (Math.random() - 0.5) * 0.8 + windEffect,
                        vy: 0.2 + Math.random() * 0.4 + Math.abs(windEffectY),
                        rotation: Math.random() * Math.PI * 2,
                        rotationSpeed: (Math.random() - 0.5) * 0.3,
                        color: Math.random() > 0.5 ? '#8B4513' : (Math.random() > 0.5 ? '#A0522D' : '#CD853F'),
                        size: 2 + Math.random() * 1.5,
                        landed: false
                    });
                }
            }
        }
        
        // Update falling leaves
        for (let i = fallingLeaves.length - 1; i >= 0; i--) {
            const leaf = fallingLeaves[i];
            
            if (!leaf.landed) {
                leaf.x += leaf.vx;
                leaf.y += leaf.vy;
                leaf.rotation += leaf.rotationSpeed;
                
                // Add wind effect to falling leaves
                const windPushX = Math.cos(game.wind.direction) * (game.wind.speed / 10) * 0.08;
                const windPushY = Math.sin(game.wind.direction) * (game.wind.speed / 10) * 0.08;
                leaf.vx += windPushX + (Math.random() - 0.5) * 0.08;
                leaf.vy += Math.abs(windPushY) * 0.5; // Wind can speed up falling
                leaf.vx *= 0.98; // Damping
                
                // Check if leaf has landed on the ground (fairway area)
                if (leaf.y >= 250 && leaf.y <= 350 && leaf.x >= 50 && leaf.x <= 750) {
                    // Leaf lands on fairway
                    leaf.landed = true;
                    leaf.landedTime = 0;
                } else if (leaf.y > 600 || leaf.x < 0 || leaf.x > 800) {
                    // Remove if completely off screen
                    fallingLeaves.splice(i, 1);
                }
            } else {
                // Leaf is on ground, keep it there for a while
                leaf.landedTime++;
                if (leaf.landedTime > 300) { // Stay for ~5 seconds
                    fallingLeaves.splice(i, 1);
                }
            }
        }
    }
    
    // Update power meter
    if (game.powerMeter.active) {
        game.powerMeter.position += game.powerMeter.speed;
        if (game.powerMeter.position >= game.powerMeter.maxPosition) {
            game.powerMeter.position = 0;
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
            if (obstacles.sandTraps) {
            for (const sand of obstacles.sandTraps) {
                // Check if point is inside polygon
                let inside = false;
                for (let i = 0, j = sand.points.length - 1; i < sand.points.length; j = i++) {
                    const xi = sand.points[i].x, yi = sand.points[i].y;
                    const xj = sand.points[j].x, yj = sand.points[j].y;
                    const intersect = ((yi > game.ball.y) !== (yj > game.ball.y))
                        && (game.ball.x < (xj - xi) * (game.ball.y - yi) / (yj - yi) + xi);
                    if (intersect) inside = !inside;
                }
                if (inside) {
                    inSand = true;
                    break;
                }
            }
            }
            
            // Check if ball is in water hazard
            let inWater = false;
            if (obstacles.waterHazards) {
                for (const water of obstacles.waterHazards) {
                    let inside = false;
                    for (let i = 0, j = water.points.length - 1; i < water.points.length; j = i++) {
                        const xi = water.points[i].x, yi = water.points[i].y;
                        const xj = water.points[j].x, yj = water.points[j].y;
                        const intersect = ((yi > game.ball.y) !== (yj > game.ball.y))
                            && (game.ball.x < (xj - xi) * (game.ball.y - yi) / (yj - yi) + xi);
                        if (intersect) inside = !inside;
                    }
                    if (inside) {
                        // Check ball isn't on the island green (course 2)
                        const distToHole = Math.sqrt(
                            (game.ball.x - game.hole.x) ** 2 + (game.ball.y - game.hole.y) ** 2
                        );
                        if (distToHole > GREEN_RADIUS + 15) { // Not on the green or beach
                            inWater = true;
                            break;
                        }
                    }
                }
            }
            
            if (inWater) {
                // Ball in water - penalty stroke + drop back to last position
                game.ball.vx = 0;
                game.ball.vy = 0;
                game.ball.x = game.lastBallPos.x;
                game.ball.y = game.lastBallPos.y;
                game.ball.z = 0;
                game.isMoving = false;
                game.inAir = false;
                game.strokes++; // Penalty stroke
                game.waterPenalty = true;
                updateUI();
            }
            
            // Check if ball is on slope
            if (obstacles.slopes) {
            for (const slope of obstacles.slopes) {
                // Check if point is inside polygon
                let inside = false;
                for (let i = 0, j = slope.points.length - 1; i < slope.points.length; j = i++) {
                    const xi = slope.points[i].x, yi = slope.points[i].y;
                    const xj = slope.points[j].x, yj = slope.points[j].y;
                    const intersect = ((yi > game.ball.y) !== (yj > game.ball.y))
                        && (game.ball.x < (xj - xi) * (game.ball.y - yi) / (yj - yi) + xi);
                    if (intersect) inside = !inside;
                }
                if (inside) {
                    // Calculate position on slope (0 = top, 1 = bottom)
                    const slopeTop = slope.points[0].y;
                    const slopeBottom = slope.points[6].y;
                    const positionOnSlope = (game.ball.y - slopeTop) / (slopeBottom - slopeTop);
                    
                    // Gentle acceleration down the slope
                    const baseAccel = 0.08;
                    game.ball.vx += slope.direction.x * baseAccel;
                    game.ball.vy += slope.direction.y * baseAccel;
                    
                    // Extra friction at bottom of slope to slow down and stop
                    if (positionOnSlope > 0.7) { // Bottom 30% of slope
                        const bottomFriction = 0.85; // Strong friction at bottom
                        game.ball.vx *= bottomFriction;
                        game.ball.vy *= bottomFriction;
                    }
                }
            }
            }
            
            // Apply friction (more in sand)
            const currentFriction = inSand ? SAND_FRICTION : FRICTION;
            game.ball.vx *= currentFriction;
            game.ball.vy *= currentFriction;
            
            // Check tree collisions (only when on ground)
            if (obstacles.trees) {
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
    
    // Ball goes in if it's close enough and moving slowly or stopped
    const holeRadius = 4; // Match the smaller visual hole size
    if (distance < holeRadius && !game.inAir) {
        // Ball falls into hole
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
    
    // Save context and apply camera transform
    ctx.save();
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-game.camera.x, -game.camera.y);
    
    // Add static grass texture to background (rough - tall grass)
    for (const grass of grassTexture) {
        // Varied green shades for depth
        if (grass.shade > 0.6) {
            ctx.strokeStyle = '#2d5a14';
        } else if (grass.shade > 0.3) {
            ctx.strokeStyle = '#3a6c1c';
        } else {
            ctx.strokeStyle = '#4a7c28';
        }
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(grass.x, grass.y);
        ctx.lineTo(grass.x + grass.lean, grass.y - grass.height);
        ctx.stroke();
    }
    
    // Add clumps of rough grass for more texture (static positions from grassTexture)
    ctx.fillStyle = '#2d5a14';
    for (let i = 0; i < grassTexture.length; i += 4) {
        const cx = grassTexture[i].x;
        const cy = grassTexture[i].y;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx - 2, cy - 4);
        ctx.lineTo(cx, cy - 1);
        ctx.lineTo(cx + 2, cy - 5);
        ctx.lineTo(cx + 1, cy - 1);
        ctx.lineTo(cx + 3, cy - 3);
        ctx.fill();
    }
    
    // Draw fairway (lighter green path)
    ctx.fillStyle = '#5a9c3c';
    if (game.currentCourse === 2) {
        // Shorter fairway that stops before the island water
        ctx.fillRect(50, 250, 590, 100);
    } else {
        ctx.fillRect(50, 250, 700, 100);
    }
    
    // Add static fairway texture with horizontal mowing pattern
    ctx.fillStyle = '#4a8c2c';
    for (const blade of fairwayTexture) {
        ctx.fillRect(blade.x, blade.y, 1, 2);
    }
    // Mowing stripes
    ctx.fillStyle = 'rgba(74, 140, 44, 0.1)';
    for (let i = 0; i < 7; i++) {
        if (i % 2 === 0) {
            ctx.fillRect(50 + i * 100, 250, 100, 100);
        }
    }
    
    // Draw slopes - seamless with fairway using alternating mow bands
    if (obstacles.slopes && obstacles.slopes.length > 0) {
    for (const slope of obstacles.slopes) {
        const slopeTop = Math.min(...slope.points.map(p => p.y));
        const slopeBottom = Math.max(...slope.points.map(p => p.y));
        const slopeLeft = Math.min(...slope.points.map(p => p.x));
        const slopeRight = Math.max(...slope.points.map(p => p.x));
        const slopeHeight = slopeBottom - slopeTop;
        const slopeWidth = slopeRight - slopeLeft;
        
        // Determine slope axis from direction
        const isHorizontal = Math.abs(slope.direction.x) > Math.abs(slope.direction.y);
        
        // Clip everything to the slope polygon
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(slope.points[0].x, slope.points[0].y);
        for (let i = 1; i < slope.points.length; i++) {
            ctx.lineTo(slope.points[i].x, slope.points[i].y);
        }
        ctx.closePath();
        ctx.clip();
        
        // Base fill matches fairway
        ctx.fillStyle = '#5a9c3c';
        ctx.fillRect(slopeLeft, slopeTop, slopeWidth, slopeHeight);
        
        // Alternating mow bands along the slope direction
        const bandCount = 7;
        if (isHorizontal) {
            const bandW = slopeWidth / bandCount;
            for (let i = 0; i < bandCount; i++) {
                const t = i / bandCount;
                if (i % 2 === 0) {
                    ctx.fillStyle = `rgba(90, 170, 65, ${0.3 - t * 0.15})`;
                } else {
                    ctx.fillStyle = `rgba(35, 70, 20, ${0.06 + t * 0.1})`;
                }
                ctx.fillRect(slopeLeft + i * bandW, slopeTop, bandW, slopeHeight);
            }
            // Darkening gradient along slope direction
            const darkGrad = ctx.createLinearGradient(slopeLeft, slopeTop + slopeHeight / 2, slopeRight, slopeTop + slopeHeight / 2);
            darkGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
            darkGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
            darkGrad.addColorStop(1, 'rgba(0,0,0,0.12)');
            ctx.fillStyle = darkGrad;
            ctx.fillRect(slopeLeft, slopeTop, slopeWidth, slopeHeight);
        } else {
            const bandH = slopeHeight / bandCount;
            for (let i = 0; i < bandCount; i++) {
                const t = i / bandCount;
                if (i % 2 === 0) {
                    ctx.fillStyle = `rgba(90, 170, 65, ${0.3 - t * 0.15})`;
                } else {
                    ctx.fillStyle = `rgba(35, 70, 20, ${0.06 + t * 0.1})`;
                }
                ctx.fillRect(slopeLeft, slopeTop + i * bandH, slopeWidth, bandH);
            }
            // Darkening gradient along slope direction
            const darkGrad = ctx.createLinearGradient(slopeLeft + slopeWidth / 2, slopeTop, slopeLeft + slopeWidth / 2, slopeBottom);
            darkGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
            darkGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
            darkGrad.addColorStop(1, 'rgba(0,0,0,0.12)');
            ctx.fillStyle = darkGrad;
            ctx.fillRect(slopeLeft, slopeTop, slopeWidth, slopeHeight);
        }
        
        ctx.restore(); // Unclip
        
        // Subtle crest highlight on the uphill edge
        ctx.strokeStyle = 'rgba(130, 200, 100, 0.35)';
        ctx.lineWidth = 1;
        if (isHorizontal) {
            ctx.beginPath();
            ctx.moveTo(slopeLeft, slopeTop);
            ctx.lineTo(slopeLeft, slopeBottom);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(slopeLeft, slopeTop);
            ctx.lineTo(slopeRight, slopeTop);
            ctx.stroke();
        }
        
        // Small subtle chevrons showing roll direction
        const dirX = slope.direction.x;
        const dirY = slope.direction.y;
        const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
        const normX = dirX / dirLen;
        const normY = dirY / dirLen;
        
        const chevronCount = isHorizontal ? 3 : 3;
        for (let i = 0; i < chevronCount; i++) {
            let ax, ay;
            if (isHorizontal) {
                ax = slopeLeft + slopeWidth * 0.5;
                ay = slopeTop + slopeHeight * (0.25 + i * 0.25);
            } else {
                ax = slopeLeft + slopeWidth * (0.25 + i * 0.25);
                ay = slopeTop + slopeHeight * 0.5;
            }
            
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ax - normY * 3 - normX * 4, ay + normX * 3 - normY * 4);
            ctx.lineTo(ax, ay);
            ctx.lineTo(ax + normY * 3 - normX * 4, ay - normX * 3 - normY * 4);
            ctx.stroke();
        }
    }
    }
    
    // Draw sand traps with organic shapes
    if (obstacles.sandTraps && obstacles.sandTraps.length > 0) {
    for (let s = 0; s < obstacles.sandTraps.length; s++) {
        const sand = obstacles.sandTraps[s];
        
        // Main sand color
        ctx.fillStyle = '#E8D4A0';
        ctx.beginPath();
        ctx.moveTo(sand.points[0].x, sand.points[0].y);
        for (let i = 1; i < sand.points.length; i++) {
            ctx.lineTo(sand.points[i].x, sand.points[i].y);
        }
        ctx.closePath();
        ctx.fill();
        
        // Darker edge
        ctx.strokeStyle = '#D4C090';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Static sand texture
        if (sandTextures[s]) {
        for (const grain of sandTextures[s]) {
            ctx.fillStyle = grain.color;
            ctx.fillRect(grain.x, grain.y, grain.size, grain.size);
        }
        }
    }
    }
    
    // Draw tee box
    ctx.fillStyle = '#6aac4c';
    ctx.fillRect(50, 270, 80, 60);
    // Tee box texture
    ctx.fillStyle = '#5a9c3c';
    for (let i = 0; i < 30; i++) {
        ctx.fillRect(50 + Math.random() * 80, 270 + Math.random() * 60, 1, 1);
    }
    // Tee markers
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(55, 275, 4, 4);
    ctx.fillRect(55, 321, 4, 4);
    
    // Draw green (before trees so trees can overlap it)
    ctx.fillStyle = '#3a6c2c';
    
    if (game.currentCourse === 2) {
        // Draw island water FIRST (behind everything on the island)
        if (obstacles.waterHazards && obstacles.waterHazards.length > 1) {
            const islandWater = obstacles.waterHazards[1];
            
            // Deep ocean water
            ctx.fillStyle = '#2E78C2';
            ctx.beginPath();
            ctx.moveTo(islandWater.points[0].x, islandWater.points[0].y);
            for (let i = 1; i < islandWater.points.length; i++) {
                ctx.lineTo(islandWater.points[i].x, islandWater.points[i].y);
            }
            ctx.closePath();
            ctx.fill();
            
            // Lighter shallow water layer closer to shore
            ctx.fillStyle = '#4A9AE8';
            ctx.beginPath();
            ctx.ellipse(game.hole.x, game.hole.y, 65, 70, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Lightest water right at shore edge
            ctx.fillStyle = '#6BB8F0';
            ctx.beginPath();
            ctx.ellipse(game.hole.x, game.hole.y, 55, 60, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Water edge/border
            ctx.strokeStyle = '#2E5C8A';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(islandWater.points[0].x, islandWater.points[0].y);
            for (let i = 1; i < islandWater.points.length; i++) {
                ctx.lineTo(islandWater.points[i].x, islandWater.points[i].y);
            }
            ctx.closePath();
            ctx.stroke();
            
            // Pixel-art ripples on island water
            updateAndDrawRipples(ctx, 99, islandWater.points);
        }
        
        // Draw beach sand (island shoreline)
        if (obstacles.sandTraps && obstacles.sandTraps.length > 0) {
            const beach = obstacles.sandTraps[0];
            
            // Sand base
            ctx.fillStyle = '#F0DCA0';
            ctx.beginPath();
            ctx.moveTo(beach.points[0].x, beach.points[0].y);
            for (let i = 1; i < beach.points.length; i++) {
                ctx.lineTo(beach.points[i].x, beach.points[i].y);
            }
            ctx.closePath();
            ctx.fill();
            
            // Wet sand at water edge (darker ring)
            ctx.strokeStyle = '#D4B878';
            ctx.lineWidth = 4;
            ctx.stroke();
            
            // Sand texture
            if (sandTextures[0]) {
                for (const grain of sandTextures[0]) {
                    ctx.fillStyle = grain.color;
                    ctx.fillRect(grain.x, grain.y, grain.size, grain.size);
                }
            }
            
            // Foam/wave line where water meets sand
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.moveTo(beach.points[0].x, beach.points[0].y);
            for (let i = 1; i < beach.points.length; i++) {
                ctx.lineTo(beach.points[i].x, beach.points[i].y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        // Now draw the green on the island (circular, centered)
        ctx.fillStyle = '#3a6c2c';
        ctx.beginPath();
        ctx.arc(game.hole.x, game.hole.y, GREEN_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Circular green for other courses
        ctx.beginPath();
        ctx.arc(game.hole.x, game.hole.y, GREEN_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Add static green texture with circular mowing pattern
    ctx.fillStyle = '#2a5c1c';
    for (const blade of greenTexture) {
        ctx.fillRect(blade.x, blade.y, 1, 1);
    }
    // Circular mowing rings
    ctx.strokeStyle = 'rgba(42, 92, 28, 0.1)';
    ctx.lineWidth = 8;
    for (let i = 1; i <= 4; i++) {
        if (i % 2 === 0) {
            ctx.beginPath();
            ctx.arc(game.hole.x, game.hole.y, i * 20, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    
    // Draw fallen leaves
    for (const leaf of fallenLeaves) {
        ctx.fillStyle = leaf.color;
        // Draw small leaf shape
        ctx.fillRect(leaf.x, leaf.y, leaf.size, leaf.size);
        // Add a darker dot for detail
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(leaf.x + 1, leaf.y + 1, 1, 1);
    }
    
    // Draw water hazards
    if (obstacles.waterHazards && obstacles.waterHazards.length > 0) {
        for (let w = 0; w < obstacles.waterHazards.length; w++) {
            // Skip the island water on course 2 (already drawn behind the green)
            if (game.currentCourse === 2 && w === 1) continue;
            
            const water = obstacles.waterHazards[w];
            
            // Sandy beach edge around the water (wider)
            ctx.fillStyle = '#E8D4A0';
            ctx.beginPath();
            for (let i = 0; i < water.points.length; i++) {
                const p = water.points[i];
                const cx = water.points.reduce((s, pt) => s + pt.x, 0) / water.points.length;
                const cy = water.points.reduce((s, pt) => s + pt.y, 0) / water.points.length;
                const dx = p.x - cx;
                const dy = p.y - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const bx = p.x + (dx / dist) * 12;
                const by = p.y + (dy / dist) * 12;
                if (i === 0) ctx.moveTo(bx, by);
                else ctx.lineTo(bx, by);
            }
            ctx.closePath();
            ctx.fill();
            
            // Wet sand (darker, closer to water)
            ctx.fillStyle = '#D4B878';
            ctx.beginPath();
            for (let i = 0; i < water.points.length; i++) {
                const p = water.points[i];
                const cx = water.points.reduce((s, pt) => s + pt.x, 0) / water.points.length;
                const cy = water.points.reduce((s, pt) => s + pt.y, 0) / water.points.length;
                const dx = p.x - cx;
                const dy = p.y - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const bx = p.x + (dx / dist) * 5;
                const by = p.y + (dy / dist) * 5;
                if (i === 0) ctx.moveTo(bx, by);
                else ctx.lineTo(bx, by);
            }
            ctx.closePath();
            ctx.fill();
            
            // Water fill
            ctx.fillStyle = '#4A90E2';
            ctx.beginPath();
            ctx.moveTo(water.points[0].x, water.points[0].y);
            for (let i = 1; i < water.points.length; i++) {
                ctx.lineTo(water.points[i].x, water.points[i].y);
            }
            ctx.closePath();
            ctx.fill();
            
            // Subtle water edge
            ctx.strokeStyle = '#2E5C8A';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Pixel-art ripples
            updateAndDrawRipples(ctx, w, water.points);
        }
    }
    
    // Draw trees with pixel art style (after green so they appear in front)
    if (obstacles.trees) {
    for (const tree of obstacles.trees) {
        const tx = tree.x;
        const ty = tree.y;
        
        if (tree.type === 'palm') {
            // Draw palm tree with wind sway
            // Calculate wind sway for palm
            const palmPhase = (tx * 0.08 + ty * 0.06) % (Math.PI * 2);
            const windDirX = Math.cos(game.wind.direction);
            const palmSway = Math.sin(game.windSway * 0.8 + palmPhase) * (game.wind.speed / 5) * 3 +
                            Math.sin(game.windSway * 1.5 + palmPhase * 2) * 1;
            const swayTopX = tx + palmSway;
            
            // Shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
            ctx.beginPath();
            ctx.ellipse(tx + 2, ty + 10, 12, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Trunk - brown and curved (base stays, top sways)
            ctx.fillStyle = '#8B6F47';
            ctx.beginPath();
            ctx.moveTo(tx - 3, ty + 10);
            ctx.lineTo(tx + 3, ty + 10);
            ctx.lineTo(swayTopX + 3, ty - 20);
            ctx.lineTo(swayTopX - 3, ty - 20);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#A0826D';
            ctx.beginPath();
            ctx.moveTo(tx - 2, ty + 10);
            ctx.lineTo(tx + 1, ty + 10);
            ctx.lineTo(swayTopX + 1, ty - 20);
            ctx.lineTo(swayTopX - 2, ty - 20);
            ctx.closePath();
            ctx.fill();
            
            // Trunk segments
            ctx.fillStyle = '#6B4F27';
            for (let i = 0; i < 4; i++) {
                const segT = i / 4;
                const segX = tx + (swayTopX - tx) * segT;
                ctx.fillRect(segX - 3, ty - 18 + i * 7, 6, 2);
            }
            
            // Palm fronds (leaves) - sway with wind
            const frondSway = palmSway * 1.2;
            ctx.fillStyle = '#2d5016';
            // Top frond
            ctx.beginPath();
            ctx.ellipse(swayTopX + frondSway * 0.3, ty - 28, 20, 8, -Math.PI / 6 + palmSway * 0.03, 0, Math.PI * 2);
            ctx.fill();
            // Left frond
            ctx.beginPath();
            ctx.ellipse(swayTopX - 15 + frondSway * 0.2, ty - 22, 18, 7, -Math.PI / 3 + palmSway * 0.04, 0, Math.PI * 2);
            ctx.fill();
            // Right frond
            ctx.beginPath();
            ctx.ellipse(swayTopX + 15 + frondSway * 0.4, ty - 22, 18, 7, Math.PI / 3 + palmSway * 0.04, 0, Math.PI * 2);
            ctx.fill();
            // Back fronds
            ctx.fillStyle = '#1d4010';
            ctx.beginPath();
            ctx.ellipse(swayTopX - 10 + frondSway * 0.2, ty - 25, 16, 6, -Math.PI / 4 + palmSway * 0.03, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(swayTopX + 10 + frondSway * 0.3, ty - 25, 16, 6, Math.PI / 4 + palmSway * 0.03, 0, Math.PI * 2);
            ctx.fill();
            
            // Bright highlights on fronds
            ctx.fillStyle = '#4a7c2c';
            ctx.fillRect(swayTopX - 2 + frondSway * 0.3, ty - 29, 4, 3);
            ctx.fillRect(swayTopX - 16 + frondSway * 0.2, ty - 23, 4, 2);
            ctx.fillRect(swayTopX + 13 + frondSway * 0.4, ty - 23, 4, 2);
        } else {
            // Draw regular forest tree with realistic wind sway
        
        // Calculate realistic wind effect for this tree
        // Trees further in the wind direction sway later (wave effect)
        const treePhase = (tx * 0.1 + ty * 0.05) % (Math.PI * 2);
        
        // Calculate distance along wind direction
        const windDirX = Math.cos(game.windGust.direction);
        const windDirY = Math.sin(game.windGust.direction);
        const distanceAlongWind = (tx * windDirX + ty * windDirY) / 100;
        
        // Wind wave travels across the course
        const windWavePhase = game.windGust.phase - distanceAlongWind;
        const windWaveStrength = Math.max(0, Math.sin(windWavePhase)) * game.windGust.strength;
        
        // Combine base sway with wind gusts
        const baseSway = Math.sin(game.windSway * 0.8 + treePhase) * 0.8 + 
                        Math.sin(game.windSway * 1.3 + treePhase * 1.7) * 0.4;
        const gustSway = windWaveStrength * windDirX * 3;
        
        const swayAmount = baseSway + gustSway;
        const swayX = tx + swayAmount;
        
        // Tree shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.beginPath();
        ctx.ellipse(tx + 2, ty + 8, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Tree trunk - taller and more visible (doesn't sway much)
        ctx.fillStyle = '#5D3A1A';
        ctx.fillRect(tx - 4, ty - 15, 8, 25);
        
        // Trunk highlight (lighter side)
        ctx.fillStyle = '#8B5A3C';
        ctx.fillRect(tx - 3, ty - 15, 4, 25);
        
        // Trunk shadow (darker side)
        ctx.fillStyle = '#3D2010';
        ctx.fillRect(tx + 1, ty - 15, 2, 25);
        
        // Base of trunk
        ctx.fillStyle = '#4D2A1A';
        ctx.fillRect(tx - 5, ty + 8, 10, 3);
        
        // Foliage - Bottom/back layer (darkest) - with sway
        ctx.fillStyle = '#2d5016';
        // Left cluster
        ctx.beginPath();
        ctx.arc(swayX - 8, ty - 18, 10, 0, Math.PI * 2);
        ctx.fill();
        // Right cluster
        ctx.beginPath();
        ctx.arc(swayX + 8, ty - 18, 10, 0, Math.PI * 2);
        ctx.fill();
        // Center back
        ctx.beginPath();
        ctx.arc(swayX, ty - 22, 12, 0, Math.PI * 2);
        ctx.fill();
        
        // Middle foliage layer - with sway
        ctx.fillStyle = '#3d6c26';
        // Left
        ctx.beginPath();
        ctx.arc(swayX - 6, ty - 20, 9, 0, Math.PI * 2);
        ctx.fill();
        // Right
        ctx.beginPath();
        ctx.arc(swayX + 6, ty - 20, 9, 0, Math.PI * 2);
        ctx.fill();
        // Top center
        ctx.beginPath();
        ctx.arc(swayX, ty - 26, 10, 0, Math.PI * 2);
        ctx.fill();
        
        // Front foliage layer (brighter) - with sway
        ctx.fillStyle = '#4a7c2c';
        // Bottom left
        ctx.beginPath();
        ctx.arc(swayX - 5, ty - 16, 8, 0, Math.PI * 2);
        ctx.fill();
        // Bottom right
        ctx.beginPath();
        ctx.arc(swayX + 5, ty - 16, 8, 0, Math.PI * 2);
        ctx.fill();
        // Center
        ctx.beginPath();
        ctx.arc(swayX, ty - 20, 9, 0, Math.PI * 2);
        ctx.fill();
        
        // Top highlights (brightest - sunlit leaves) - with sway
        ctx.fillStyle = '#5a9c3c';
        ctx.beginPath();
        ctx.arc(swayX - 3, ty - 24, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(swayX + 3, ty - 25, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Brightest highlights - with sway
        ctx.fillStyle = '#6aac4c';
        ctx.fillRect(swayX - 4, ty - 26, 3, 3);
        ctx.fillRect(swayX + 2, ty - 27, 2, 2);
        
        // Add some texture/detail to foliage - with sway
        ctx.fillStyle = '#1d4010';
        ctx.fillRect(swayX - 7, ty - 19, 2, 2);
        ctx.fillRect(swayX + 6, ty - 21, 2, 2);
        ctx.fillRect(swayX - 2, ty - 17, 2, 2);
        ctx.fillRect(swayX + 1, ty - 23, 2, 2);
        }
    }
    }
    
    // Draw falling leaves animation (only for forest course)
    if (game.currentCourse === 1) {
        for (const leaf of fallingLeaves) {
            ctx.save();
            ctx.translate(leaf.x, leaf.y);
            
            if (!leaf.landed) {
                // Falling leaf - rotating
                ctx.rotate(leaf.rotation);
                ctx.fillStyle = leaf.color;
                ctx.fillRect(-leaf.size / 2, -leaf.size / 2, leaf.size, leaf.size);
            } else {
                // Landed leaf - flat on ground with slight transparency
                ctx.globalAlpha = 0.8;
                ctx.fillStyle = leaf.color;
                ctx.fillRect(-leaf.size / 2, -leaf.size / 2, leaf.size, leaf.size);
                // Add shadow
                ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
                ctx.fillRect(-leaf.size / 2 + 0.5, -leaf.size / 2 + 0.5, leaf.size, leaf.size);
            }
            
            ctx.restore();
        }
    }
    
    // Draw hole with realistic colors (smaller, more proportionate)
    const holeSize = 4; // Smaller, more realistic hole size
    
    // Outer cup edge (light gray/beige - worn edge)
    ctx.fillStyle = '#C0C0C0';
    ctx.beginPath();
    ctx.arc(game.hole.x, game.hole.y, holeSize + 1.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Inner cup (darker gray)
    ctx.fillStyle = '#505050';
    ctx.beginPath();
    ctx.arc(game.hole.x, game.hole.y, holeSize + 0.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Black hole center (very dark)
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(game.hole.x, game.hole.y, holeSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw flag pole (white/light colored, thinner)
    ctx.strokeStyle = '#F5F5F5';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(game.hole.x, game.hole.y);
    ctx.lineTo(game.hole.x, game.hole.y - 25);
    ctx.stroke();
    
    // Flag with wave animation (smaller, more proportionate)
    const flagHeight = 8;
    const flagWidth = 12;
    const flagTop = game.hole.y - 25;
    
    // Calculate wave effect
    const wave1 = Math.sin(game.flagWave) * 1.5;
    const wave2 = Math.sin(game.flagWave + 0.5) * 1;
    
    // Draw waving flag
    ctx.fillStyle = '#DC143C';
    ctx.beginPath();
    ctx.moveTo(game.hole.x, flagTop);
    ctx.quadraticCurveTo(
        game.hole.x + flagWidth / 2 + wave1, 
        flagTop + flagHeight / 2, 
        game.hole.x + wave2, 
        flagTop + flagHeight
    );
    ctx.lineTo(game.hole.x, flagTop);
    ctx.closePath();
    ctx.fill();
    
    // Flag shadow/outline for depth
    ctx.strokeStyle = '#8B0000';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    
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
    
    // Restore context for UI elements (drawn in screen space)
    ctx.restore();
    
    // Draw club selector
    drawClubSelector();
    
    // Draw wind compass
    drawWindCompass();
    
    // Draw map mode indicator or hint
    if (mapMode) {
        // Map mode banner
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(canvas.width / 2 - 120, 10, 240, 30);
        ctx.strokeStyle = '#FFFF00';
        ctx.lineWidth = 2;
        ctx.strokeRect(canvas.width / 2 - 120, 10, 240, 30);
        ctx.fillStyle = '#FFFF00';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MAP VIEW - Drag to look around', canvas.width / 2, 30);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '12px monospace';
        ctx.fillText('Press M to return', canvas.width / 2, 55);
    } else if (!game.isMoving && !game.won && !game.powerMeter.active) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Press M to view map', canvas.width / 2, canvas.height - 10);
    }
    
    // Draw aiming preview and target indicators in world space
    ctx.save();
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-game.camera.x, -game.camera.y);
    
    // Draw aiming preview (when hovering, before clicking) - not in map mode
    if (aimingMode && !game.powerMeter.active && !mapMode) {
        // Draw line from ball to mouse position
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        ctx.moveTo(game.ball.x, game.ball.y);
        ctx.lineTo(mousePos.x, mousePos.y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw target marker at mouse position
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mousePos.x, mousePos.y, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mousePos.x - 10, mousePos.y);
        ctx.lineTo(mousePos.x + 10, mousePos.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mousePos.x, mousePos.y - 10);
        ctx.lineTo(mousePos.x, mousePos.y + 10);
        ctx.stroke();
    }
    
    // Draw confirmed target indicator and aim line (after first click) - not in map mode
    if (game.targetPos.set && game.powerMeter.active && !mapMode) {
        // Draw line from ball to target
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        ctx.moveTo(game.ball.x, game.ball.y);
        ctx.lineTo(game.targetPos.x, game.targetPos.y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw target marker
        ctx.strokeStyle = '#FFFF00';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(game.targetPos.x, game.targetPos.y, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(game.targetPos.x - 12, game.targetPos.y);
        ctx.lineTo(game.targetPos.x + 12, game.targetPos.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(game.targetPos.x, game.targetPos.y - 12);
        ctx.lineTo(game.targetPos.x, game.targetPos.y + 12);
        ctx.stroke();
    }
    
    // Restore context after world space drawing
    ctx.restore();
    
    // Draw power meter bar
    if (game.powerMeter.active) {
        const barWidth = 300;
        const barHeight = 30;
        const barX = canvas.width / 2 - barWidth / 2;
        const barY = canvas.height - 150;
        
        // Background
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Perfect zone (green)
        const perfectStart = (game.powerMeter.perfectZoneStart / 100) * barWidth;
        const perfectWidth = ((game.powerMeter.perfectZoneEnd - game.powerMeter.perfectZoneStart) / 100) * barWidth;
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(barX + perfectStart, barY, perfectWidth, barHeight);
        
        // Moving indicator
        const indicatorX = barX + (game.powerMeter.position / 100) * barWidth;
        ctx.fillStyle = '#FFF';
        ctx.fillRect(indicatorX - 3, barY - 5, 6, barHeight + 10);
        
        // Border
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 3;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
        
        // Text
        ctx.fillStyle = '#FFF';
        ctx.font = '16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Click to hit!', canvas.width / 2, barY - 10);
    }
    
    // Draw water penalty message
    if (game.waterPenalty) {
        game.waterPenaltyTimer++;
        if (game.waterPenaltyTimer < 120) { // Show for 2 seconds
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(canvas.width / 2 - 140, canvas.height / 2 - 30, 280, 60);
            ctx.strokeStyle = '#4A90E2';
            ctx.lineWidth = 2;
            ctx.strokeRect(canvas.width / 2 - 140, canvas.height / 2 - 30, 280, 60);
            ctx.fillStyle = '#FF6347';
            ctx.font = 'bold 18px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('WATER HAZARD', canvas.width / 2, canvas.height / 2 - 5);
            ctx.fillStyle = '#fff';
            ctx.font = '14px monospace';
            ctx.fillText('+1 Penalty Stroke', canvas.width / 2, canvas.height / 2 + 18);
        } else {
            game.waterPenalty = false;
            game.waterPenaltyTimer = 0;
        }
    }
    
    // Draw scorecard when hole is complete
    if (game.won) {
        drawScorecard();
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

function drawClubSelector() {
    const club = clubs[game.selectedClub];
    const boxX = 10;
    const boxY = canvas.height - 120;
    const boxWidth = 200;
    const boxHeight = 100;
    
    // Background box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    
    // Left arrow button area
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(boxX + 5, boxY + 25, 35, 50);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(boxX + 30, boxY + 38);
    ctx.lineTo(boxX + 15, boxY + 50);
    ctx.lineTo(boxX + 30, boxY + 62);
    ctx.stroke();
    
    // Right arrow button area
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(boxX + boxWidth - 40, boxY + 25, 35, 50);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(boxX + boxWidth - 30, boxY + 38);
    ctx.lineTo(boxX + boxWidth - 15, boxY + 50);
    ctx.lineTo(boxX + boxWidth - 30, boxY + 62);
    ctx.stroke();
    
    // Draw club icon (centered)
    const iconX = boxX + boxWidth / 2;
    const iconY = boxY + 50;
    
    if (club.name === 'Putter') {
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(iconX, iconY - 22);
        ctx.lineTo(iconX, iconY);
        ctx.stroke();
        ctx.fillStyle = '#C0C0C0';
        ctx.fillRect(iconX - 9, iconY, 18, 5);
    } else if (club.name === 'Sand Wedge') {
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(iconX, iconY - 22);
        ctx.lineTo(iconX, iconY);
        ctx.stroke();
        ctx.fillStyle = '#C0C0C0';
        ctx.beginPath();
        ctx.moveTo(iconX - 3, iconY);
        ctx.lineTo(iconX + 12, iconY + 5);
        ctx.lineTo(iconX + 12, iconY + 9);
        ctx.lineTo(iconX - 3, iconY + 5);
        ctx.fill();
    } else if (club.name === '7 Iron') {
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(iconX, iconY - 22);
        ctx.lineTo(iconX, iconY);
        ctx.stroke();
        ctx.fillStyle = '#C0C0C0';
        ctx.beginPath();
        ctx.moveTo(iconX - 4, iconY);
        ctx.lineTo(iconX + 9, iconY + 3);
        ctx.lineTo(iconX + 9, iconY + 7);
        ctx.lineTo(iconX - 4, iconY + 5);
        ctx.fill();
    } else if (club.name === 'Driver') {
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(iconX, iconY - 22);
        ctx.lineTo(iconX, iconY - 5);
        ctx.stroke();
        ctx.fillStyle = '#C0C0C0';
        ctx.beginPath();
        ctx.arc(iconX + 4, iconY + 3, 9, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Club name (bigger text)
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(club.name, iconX, boxY + 88);
}

function drawWindCompass() {
    const compassSize = 60;
    const compassX = canvas.width - compassSize - 15;
    const compassY = 15 + compassSize / 2;
    
    // Background circle
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.arc(compassX, compassY, compassSize / 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Border
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Cardinal directions
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // N
    ctx.fillText('N', compassX, compassY - 20);
    // E
    ctx.fillText('E', compassX + 20, compassY);
    // S
    ctx.fillText('S', compassX, compassY + 20);
    // W
    ctx.fillText('W', compassX - 20, compassY);
    
    // Wind arrow
    const arrowLength = 18;
    const arrowAngle = game.wind.direction - Math.PI / 2; // Adjust for canvas coordinates
    const arrowEndX = compassX + Math.cos(arrowAngle) * arrowLength;
    const arrowEndY = compassY + Math.sin(arrowAngle) * arrowLength;
    
    // Arrow color based on wind speed
    const windStrength = game.wind.speed / game.wind.maxSpeed;
    if (windStrength < 0.3) {
        ctx.strokeStyle = '#90EE90'; // Light green - calm
    } else if (windStrength < 0.7) {
        ctx.strokeStyle = '#FFD700'; // Yellow - moderate
    } else {
        ctx.strokeStyle = '#FF6347'; // Red - strong
    }
    
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(compassX, compassY);
    ctx.lineTo(arrowEndX, arrowEndY);
    ctx.stroke();
    
    // Arrow head
    const headAngle1 = arrowAngle - Math.PI / 6;
    const headAngle2 = arrowAngle + Math.PI / 6;
    ctx.beginPath();
    ctx.moveTo(arrowEndX, arrowEndY);
    ctx.lineTo(arrowEndX - Math.cos(headAngle1) * 6, arrowEndY - Math.sin(headAngle1) * 6);
    ctx.moveTo(arrowEndX, arrowEndY);
    ctx.lineTo(arrowEndX - Math.cos(headAngle2) * 6, arrowEndY - Math.sin(headAngle2) * 6);
    ctx.stroke();
    
    // Wind speed text
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(game.wind.speed) + ' mph', compassX, compassY + compassSize / 2 + 20);
}

function drawScorecard() {
    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Scorecard box
    const boxWidth = 400;
    const boxHeight = 300;
    const boxX = canvas.width / 2 - boxWidth / 2;
    const boxY = canvas.height / 2 - boxHeight / 2;
    
    // Background
    ctx.fillStyle = '#2d5016';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Border
    ctx.strokeStyle = '#6aac4c';
    ctx.lineWidth = 4;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    
    // Title
    ctx.fillStyle = '#FFFF00';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HOLE COMPLETE!', canvas.width / 2, boxY + 50);
    
    // Course name
    ctx.fillStyle = '#fff';
    ctx.font = '20px monospace';
    const courseName = game.currentCourse === 1 ? 'Forest Glen' : 'Tropical Paradise';
    ctx.fillText(`Course ${game.currentCourse}: ${courseName}`, canvas.width / 2, boxY + 85);
    
    // Score details
    const par = game.par;
    const diff = game.strokes - par;
    let scoreText = '';
    let scoreColor = '#fff';
    
    if (diff === -2) {
        scoreText = 'EAGLE! 🦅';
        scoreColor = '#FFD700';
    } else if (diff === -1) {
        scoreText = 'BIRDIE! 🐦';
        scoreColor = '#90EE90';
    } else if (diff === 0) {
        scoreText = 'PAR ⛳';
        scoreColor = '#87CEEB';
    } else if (diff === 1) {
        scoreText = 'BOGEY';
        scoreColor = '#FFA500';
    } else if (diff === 2) {
        scoreText = 'DOUBLE BOGEY';
        scoreColor = '#FF6347';
    } else {
        scoreText = `+${diff}`;
        scoreColor = '#FF4444';
    }
    
    ctx.fillStyle = scoreColor;
    ctx.font = 'bold 36px monospace';
    ctx.fillText(scoreText, canvas.width / 2, boxY + 140);
    
    // Stats
    ctx.fillStyle = '#fff';
    ctx.font = '18px monospace';
    ctx.fillText(`Par: ${par}`, canvas.width / 2, boxY + 180);
    ctx.fillText(`Your Score: ${game.strokes}`, canvas.width / 2, boxY + 210);
    
    // Instructions
    ctx.font = '14px monospace';
    ctx.fillStyle = '#aaa';
    ctx.fillText('Click "Back to Menu" to play another course', canvas.width / 2, boxY + 260);
}

function updateUI() {
    document.getElementById('strokes').textContent = game.strokes;
    const status = document.getElementById('status');
    
    if (game.won) {
        const par = game.par;
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
        status.textContent = onGreen ? 'On the green - Click to putt' : 'Hover to aim';
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Load course function
function loadCourse(courseNumber) {
    game.currentCourse = courseNumber;
    
    // Clear sand textures
    sandTextures.length = 0;
    
    // Set wind for the hole (stays constant for entire hole)
    if (courseNumber === 1) {
        // Forest Glen - Par 3 - Beginner course, max 5 mph wind
        game.wind.maxSpeed = 5;
        game.wind.speed = Math.random() * game.wind.maxSpeed;
        game.wind.direction = Math.random() * Math.PI * 2;
    } else if (courseNumber === 2) {
        // Tropical Paradise - Par 5 - More challenging wind
        game.wind.maxSpeed = 10;
        game.wind.speed = Math.random() * game.wind.maxSpeed;
        game.wind.direction = Math.random() * Math.PI * 2;
    }
    
    if (courseNumber === 1) {
        // Forest Glen - Par 3
        game.par = 3;
        game.tee = { x: 100, y: 300 };
        game.hole = { x: 700, y: 300 };
        GREEN_RADIUS = 80;
        
        obstacles.sandTraps = [
            { 
                x: 300, y: 200, 
                points: [
                    {x: 300, y: 215}, {x: 310, y: 205}, {x: 330, y: 200}, 
                    {x: 360, y: 202}, {x: 375, y: 210}, {x: 380, y: 230},
                    {x: 375, y: 255}, {x: 350, y: 260}, {x: 320, y: 258},
                    {x: 305, y: 245}, {x: 300, y: 225}
                ]
            },
            { 
                x: 500, y: 350,
                points: [
                    {x: 500, y: 360}, {x: 515, y: 352}, {x: 540, y: 350},
                    {x: 565, y: 355}, {x: 570, y: 375}, {x: 560, y: 395},
                    {x: 535, y: 400}, {x: 510, y: 395}, {x: 500, y: 380}
                ]
            }
        ];
        
        // Generate sand textures
        for (let s = 0; s < obstacles.sandTraps.length; s++) {
            sandTextures[s] = [];
            for (let i = 0; i < 50; i++) {
                sandTextures[s].push({ 
                    x: obstacles.sandTraps[s].x + Math.random() * 80, 
                    y: obstacles.sandTraps[s].y + Math.random() * 60,
                    size: Math.random() > 0.7 ? 1 : 2,
                    color: Math.random() > 0.5 ? '#D4C090' : '#F0E4B0'
                });
            }
        }
        
        obstacles.waterHazards = [];
        
        obstacles.trees = [
            { x: 35, y: 238, radius: 15, type: 'forest' },
            { x: 70, y: 225, radius: 15, type: 'forest' },
            { x: 90, y: 242, radius: 15, type: 'forest' },
            { x: 115, y: 230, radius: 15, type: 'forest' },
            { x: 145, y: 220, radius: 15, type: 'forest' },
            { x: 165, y: 235, radius: 15, type: 'forest' },
            { x: 195, y: 228, radius: 15, type: 'forest' },
            { x: 220, y: 240, radius: 15, type: 'forest' },
            { x: 245, y: 232, radius: 15, type: 'forest' },
            { x: 270, y: 225, radius: 15, type: 'forest' },
            { x: 390, y: 235, radius: 15, type: 'forest' },
            { x: 415, y: 228, radius: 15, type: 'forest' },
            { x: 445, y: 240, radius: 15, type: 'forest' },
            { x: 470, y: 232, radius: 15, type: 'forest' },
            { x: 580, y: 238, radius: 15, type: 'forest' },
            { x: 610, y: 230, radius: 15, type: 'forest' },
            { x: 640, y: 242, radius: 15, type: 'forest' },
            { x: 665, y: 235, radius: 15, type: 'forest' },
            { x: 695, y: 228, radius: 15, type: 'forest' },
            { x: 720, y: 240, radius: 15, type: 'forest' },
            { x: 750, y: 232, radius: 15, type: 'forest' },
            { x: 780, y: 225, radius: 15, type: 'forest' },
            { x: 35, y: 362, radius: 15, type: 'forest' },
            { x: 70, y: 375, radius: 15, type: 'forest' },
            { x: 90, y: 358, radius: 15, type: 'forest' },
            { x: 115, y: 370, radius: 15, type: 'forest' },
            { x: 145, y: 380, radius: 15, type: 'forest' },
            { x: 165, y: 365, radius: 15, type: 'forest' },
            { x: 195, y: 372, radius: 15, type: 'forest' },
            { x: 220, y: 360, radius: 15, type: 'forest' },
            { x: 245, y: 368, radius: 15, type: 'forest' },
            { x: 270, y: 375, radius: 15, type: 'forest' },
            { x: 295, y: 362, radius: 15, type: 'forest' },
            { x: 325, y: 370, radius: 15, type: 'forest' },
            { x: 390, y: 365, radius: 15, type: 'forest' },
            { x: 415, y: 372, radius: 15, type: 'forest' },
            { x: 445, y: 360, radius: 15, type: 'forest' },
            { x: 470, y: 368, radius: 15, type: 'forest' },
            { x: 580, y: 362, radius: 15, type: 'forest' },
            { x: 610, y: 370, radius: 15, type: 'forest' },
            { x: 640, y: 358, radius: 15, type: 'forest' },
            { x: 665, y: 365, radius: 15, type: 'forest' },
            { x: 695, y: 372, radius: 15, type: 'forest' },
            { x: 720, y: 360, radius: 15, type: 'forest' },
            { x: 750, y: 368, radius: 15, type: 'forest' },
            { x: 780, y: 375, radius: 15, type: 'forest' }
        ];
        
        obstacles.slopes = [
            {
                x: 550, y: 250,
                points: [
                    {x: 550, y: 250}, {x: 580, y: 250}, {x: 610, y: 250},
                    {x: 620, y: 250}, {x: 620, y: 350}, {x: 610, y: 350},
                    {x: 580, y: 350}, {x: 550, y: 350}
                ],
                direction: { x: 1, y: 0 } // Rolls toward the hole (right)
            }
        ];
    }
    else if (courseNumber === 2) {
        // Tropical Paradise - Par 5
        game.par = 5;
        game.tee = { x: 100, y: 300 };
        game.hole = { x: 750, y: 300 };
        GREEN_RADIUS = 40; // Narrow green
        
        // Beach sand around the green island
        obstacles.sandTraps = [
            {
                x: 700, y: 250,
                points: [
                    {x: 700, y: 240}, {x: 720, y: 235}, {x: 745, y: 232},
                    {x: 770, y: 238}, {x: 790, y: 250}, {x: 795, y: 275},
                    {x: 795, y: 310}, {x: 790, y: 340}, {x: 775, y: 358},
                    {x: 755, y: 365}, {x: 730, y: 368}, {x: 710, y: 362},
                    {x: 698, y: 348}, {x: 693, y: 325}, {x: 693, y: 290},
                    {x: 695, y: 260}
                ]
            }
        ];
        
        // Generate sand textures
        for (let s = 0; s < obstacles.sandTraps.length; s++) {
            sandTextures[s] = [];
            for (let i = 0; i < 80; i++) {
                sandTextures[s].push({
                    x: 693 + Math.random() * 102,
                    y: 232 + Math.random() * 136,
                    size: Math.random() > 0.7 ? 1 : 2,
                    color: Math.random() > 0.5 ? '#D4C090' : '#F0E4B0'
                });
            }
        }
        
        // River running through middle + ocean/water around the island green
        obstacles.waterHazards = [
            {
                // River
                points: [
                    {x: 350, y: 200}, {x: 380, y: 210}, {x: 400, y: 240},
                    {x: 410, y: 280}, {x: 420, y: 320}, {x: 430, y: 360},
                    {x: 440, y: 400}, {x: 420, y: 420}, {x: 390, y: 410},
                    {x: 370, y: 380}, {x: 360, y: 340}, {x: 350, y: 300},
                    {x: 340, y: 260}, {x: 330, y: 220}
                ]
            },
            {
                // Island water surrounding the green
                points: [
                    {x: 660, y: 210}, {x: 700, y: 200}, {x: 740, y: 195},
                    {x: 780, y: 200}, {x: 800, y: 220}, {x: 800, y: 260},
                    {x: 800, y: 300}, {x: 800, y: 360},
                    {x: 800, y: 400}, {x: 770, y: 405}, {x: 735, y: 400},
                    {x: 700, y: 395}, {x: 670, y: 385}, {x: 655, y: 360},
                    {x: 650, y: 320}, {x: 650, y: 280}, {x: 655, y: 240}
                ]
            }
        ];
        
        // Palm trees - removed from near the green, add a couple on the island
        obstacles.trees = [
            { x: 50, y: 240, radius: 18, type: 'palm' },
            { x: 90, y: 230, radius: 18, type: 'palm' },
            { x: 130, y: 235, radius: 18, type: 'palm' },
            { x: 170, y: 228, radius: 18, type: 'palm' },
            { x: 210, y: 240, radius: 18, type: 'palm' },
            { x: 250, y: 232, radius: 18, type: 'palm' },
            { x: 290, y: 225, radius: 18, type: 'palm' },
            { x: 480, y: 230, radius: 18, type: 'palm' },
            { x: 520, y: 238, radius: 18, type: 'palm' },
            { x: 560, y: 232, radius: 18, type: 'palm' },
            { x: 600, y: 240, radius: 18, type: 'palm' },
            { x: 50, y: 360, radius: 18, type: 'palm' },
            { x: 90, y: 370, radius: 18, type: 'palm' },
            { x: 130, y: 365, radius: 18, type: 'palm' },
            { x: 170, y: 372, radius: 18, type: 'palm' },
            { x: 210, y: 360, radius: 18, type: 'palm' },
            { x: 250, y: 368, radius: 18, type: 'palm' },
            { x: 290, y: 375, radius: 18, type: 'palm' },
            { x: 480, y: 370, radius: 18, type: 'palm' },
            { x: 520, y: 362, radius: 18, type: 'palm' },
            { x: 560, y: 368, radius: 18, type: 'palm' },
            { x: 600, y: 360, radius: 18, type: 'palm' },
            // Palm trees on the island
            { x: 715, y: 250, radius: 14, type: 'palm' },
            { x: 775, y: 340, radius: 14, type: 'palm' }
        ];
        
        obstacles.slopes = [];
    }
    
    // Update info display
    document.getElementById('info').innerHTML = `Par ${game.par} | Strokes: <span id="strokes">0</span> | <span id="status">Hover to aim</span>`;
}

// Reset game function
function resetGame() {
    game.ball.x = game.tee.x;
    game.ball.y = game.tee.y;
    game.ball.vx = 0;
    game.ball.vy = 0;
    game.ball.z = 0;
    game.ball.vz = 0;
    game.golfer.x = game.tee.x;
    game.golfer.y = game.tee.y;
    game.golfer.swinging = false;
    game.golfer.swingFrame = 0;
    game.powerMeter.active = false;
    game.powerMeter.position = 0;
    game.targetPos.set = false;
    game.strokes = 0;
    game.isMoving = false;
    game.won = false;
    game.inAir = false;
    game.selectedClub = 0;
    game.lastBallPos.x = game.tee.x;
    game.lastBallPos.y = game.tee.y;
    game.waterPenalty = false;
    game.waterPenaltyTimer = 0;
    aimingMode = false;
    mapMode = false;
    cameraOffset.x = 0;
    cameraOffset.y = 0;
    updateUI();
}

// Start game
loadCourse(1); // Load default course
gameLoop();
