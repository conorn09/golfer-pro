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
    par: 3
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
const GRAVITY = 0.3;
let GREEN_RADIUS = 80;

// Static texture patterns (generated once)
const grassTexture = [];
const fairwayTexture = [];
const greenTexture = [];
const sandTextures = [[], []];
const fallenLeaves = [];

// Generate static textures
for (let i = 0; i < 400; i++) {
    grassTexture.push({ x: Math.random() * 800, y: Math.random() * 600 });
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
        size: Math.random() > 0.5 ? 2 : 3
    });
}

// Mouse handling
let mousePos = { x: 0, y: 0 };
let aimingMode = false; // Track if we're in aiming mode (before power meter)

canvas.addEventListener('mousedown', (e) => {
    if (!game.isMoving && !game.won) {
        const rect = canvas.getBoundingClientRect();
        mousePos.x = e.clientX - rect.left;
        mousePos.y = e.clientY - rect.top;
        
        // Check if clicking club selector arrows
        if (mousePos.y > canvas.height - 80 && mousePos.y < canvas.height - 20) {
            if (mousePos.x > 10 && mousePos.x < 30) {
                // Left arrow
                game.selectedClub = (game.selectedClub - 1 + clubs.length) % clubs.length;
                return;
            } else if (mousePos.x > 110 && mousePos.x < 130) {
                // Right arrow
                game.selectedClub = (game.selectedClub + 1) % clubs.length;
                return;
            }
        }
        
        // First click: confirm target and start power meter
        if (!game.powerMeter.active) {
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

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    
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
        aimingMode = true;
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
            // Putting - ball rolls on ground
            const putterSpeed = power * (powerMultiplier / 20);
            game.ball.vx = Math.cos(actualAngle) * putterSpeed;
            game.ball.vy = Math.sin(actualAngle) * putterSpeed;
            game.ball.z = 0;
            game.ball.vz = 0;
            game.inAir = false;
        } else {
            // Full shot - ball flies through air
            const shotSpeed = power * (powerMultiplier / 35);
            game.ball.vx = Math.cos(actualAngle) * shotSpeed;
            game.ball.vy = Math.sin(actualAngle) * shotSpeed;
            game.ball.z = 0;
            game.ball.vz = power * club.loft * 0.5;
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
                    game.ball.vx += slope.direction.x;
                    game.ball.vy += slope.direction.y;
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
    
    // Add static grass texture to background (rough)
    ctx.fillStyle = '#3a6c1c';
    for (const grass of grassTexture) {
        ctx.fillRect(grass.x, grass.y, 1, 2);
    }
    
    // Draw fairway (lighter green path)
    ctx.fillStyle = '#5a9c3c';
    ctx.fillRect(50, 250, 700, 100);
    
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
    
    // Draw slopes with textured appearance
    if (obstacles.slopes) {
    for (const slope of obstacles.slopes) {
        // Base slope color with gradient effect
        ctx.fillStyle = '#5a9c3c';
        ctx.beginPath();
        ctx.moveTo(slope.points[0].x, slope.points[0].y);
        for (let i = 1; i < slope.points.length; i++) {
            ctx.lineTo(slope.points[i].x, slope.points[i].y);
        }
        ctx.closePath();
        ctx.fill();
        
        // Add darker shading on one side
        ctx.fillStyle = 'rgba(58, 124, 44, 0.3)';
        ctx.beginPath();
        ctx.moveTo(slope.points[0].x, slope.points[0].y);
        ctx.lineTo(slope.points[1].x, slope.points[1].y);
        ctx.lineTo(slope.points[2].x, slope.points[2].y);
        ctx.lineTo(slope.points[0].x + 20, slope.points[0].y + 20);
        ctx.closePath();
        ctx.fill();
        
        // Contour lines for elevation
        ctx.strokeStyle = 'rgba(74, 140, 44, 0.4)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
            ctx.beginPath();
            const offset = i * 12;
            ctx.moveTo(slope.points[0].x + 10, slope.points[0].y + offset);
            ctx.lineTo(slope.points[3].x - 10, slope.points[3].y + offset - 5);
            ctx.stroke();
        }
        
        // Add texture dots
        ctx.fillStyle = '#4a8c2c';
        for (let i = 0; i < 30; i++) {
            const px = slope.points[0].x + Math.random() * 90;
            const py = slope.points[0].y + Math.random() * 70;
            ctx.fillRect(px, py, 1, 1);
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
        // Narrow elongated green for tropical course
        ctx.beginPath();
        ctx.ellipse(game.hole.x, game.hole.y, GREEN_RADIUS * 2, GREEN_RADIUS, 0, 0, Math.PI * 2);
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
    
    // Draw water hazards (for tropical course)
    if (obstacles.waterHazards && obstacles.waterHazards.length > 0) {
        for (const water of obstacles.waterHazards) {
            // Water color
            ctx.fillStyle = '#4A90E2';
            ctx.beginPath();
            ctx.moveTo(water.points[0].x, water.points[0].y);
            for (let i = 1; i < water.points.length; i++) {
                ctx.lineTo(water.points[i].x, water.points[i].y);
            }
            ctx.closePath();
            ctx.fill();
            
            // Darker water edge
            ctx.strokeStyle = '#2E5C8A';
            ctx.lineWidth = 3;
            ctx.stroke();
            
            // Water ripples/texture
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            for (let i = 0; i < 15; i++) {
                const rx = water.points[0].x + Math.random() * 80;
                const ry = water.points[0].y + Math.random() * 200;
                ctx.fillRect(rx, ry, 2, 1);
            }
        }
    }
    
    // Draw trees with pixel art style (after green so they appear in front)
    if (obstacles.trees) {
    for (const tree of obstacles.trees) {
        const tx = tree.x;
        const ty = tree.y;
        
        if (tree.type === 'palm') {
            // Draw palm tree
            // Shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
            ctx.beginPath();
            ctx.ellipse(tx + 2, ty + 10, 12, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Trunk - brown and curved
            ctx.fillStyle = '#8B6F47';
            ctx.fillRect(tx - 3, ty - 20, 6, 30);
            ctx.fillStyle = '#A0826D';
            ctx.fillRect(tx - 2, ty - 20, 3, 30);
            
            // Trunk segments
            ctx.fillStyle = '#6B4F27';
            for (let i = 0; i < 4; i++) {
                ctx.fillRect(tx - 3, ty - 18 + i * 7, 6, 2);
            }
            
            // Palm fronds (leaves)
            ctx.fillStyle = '#2d5016';
            // Top frond
            ctx.beginPath();
            ctx.ellipse(tx, ty - 28, 20, 8, -Math.PI / 6, 0, Math.PI * 2);
            ctx.fill();
            // Left frond
            ctx.beginPath();
            ctx.ellipse(tx - 15, ty - 22, 18, 7, -Math.PI / 3, 0, Math.PI * 2);
            ctx.fill();
            // Right frond
            ctx.beginPath();
            ctx.ellipse(tx + 15, ty - 22, 18, 7, Math.PI / 3, 0, Math.PI * 2);
            ctx.fill();
            // Back fronds
            ctx.fillStyle = '#1d4010';
            ctx.beginPath();
            ctx.ellipse(tx - 10, ty - 25, 16, 6, -Math.PI / 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(tx + 10, ty - 25, 16, 6, Math.PI / 4, 0, Math.PI * 2);
            ctx.fill();
            
            // Bright highlights on fronds
            ctx.fillStyle = '#4a7c2c';
            ctx.fillRect(tx - 2, ty - 29, 4, 3);
            ctx.fillRect(tx - 16, ty - 23, 4, 2);
            ctx.fillRect(tx + 13, ty - 23, 4, 2);
        } else {
            // Draw regular forest tree
        
        // Tree shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.beginPath();
        ctx.ellipse(tx + 2, ty + 8, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Tree trunk - taller and more visible
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
        
        // Foliage - Bottom/back layer (darkest)
        ctx.fillStyle = '#2d5016';
        // Left cluster
        ctx.beginPath();
        ctx.arc(tx - 8, ty - 18, 10, 0, Math.PI * 2);
        ctx.fill();
        // Right cluster
        ctx.beginPath();
        ctx.arc(tx + 8, ty - 18, 10, 0, Math.PI * 2);
        ctx.fill();
        // Center back
        ctx.beginPath();
        ctx.arc(tx, ty - 22, 12, 0, Math.PI * 2);
        ctx.fill();
        
        // Middle foliage layer
        ctx.fillStyle = '#3d6c26';
        // Left
        ctx.beginPath();
        ctx.arc(tx - 6, ty - 20, 9, 0, Math.PI * 2);
        ctx.fill();
        // Right
        ctx.beginPath();
        ctx.arc(tx + 6, ty - 20, 9, 0, Math.PI * 2);
        ctx.fill();
        // Top center
        ctx.beginPath();
        ctx.arc(tx, ty - 26, 10, 0, Math.PI * 2);
        ctx.fill();
        
        // Front foliage layer (brighter)
        ctx.fillStyle = '#4a7c2c';
        // Bottom left
        ctx.beginPath();
        ctx.arc(tx - 5, ty - 16, 8, 0, Math.PI * 2);
        ctx.fill();
        // Bottom right
        ctx.beginPath();
        ctx.arc(tx + 5, ty - 16, 8, 0, Math.PI * 2);
        ctx.fill();
        // Center
        ctx.beginPath();
        ctx.arc(tx, ty - 20, 9, 0, Math.PI * 2);
        ctx.fill();
        
        // Top highlights (brightest - sunlit leaves)
        ctx.fillStyle = '#5a9c3c';
        ctx.beginPath();
        ctx.arc(tx - 3, ty - 24, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(tx + 3, ty - 25, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Brightest highlights
        ctx.fillStyle = '#6aac4c';
        ctx.fillRect(tx - 4, ty - 26, 3, 3);
        ctx.fillRect(tx + 2, ty - 27, 2, 2);
        
        // Add some texture/detail to foliage
        ctx.fillStyle = '#1d4010';
        ctx.fillRect(tx - 7, ty - 19, 2, 2);
        ctx.fillRect(tx + 6, ty - 21, 2, 2);
        ctx.fillRect(tx - 2, ty - 17, 2, 2);
        ctx.fillRect(tx + 1, ty - 23, 2, 2);
        }
    }
    }
    
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
    
    // Draw club selector
    drawClubSelector();
    
    // Draw aiming preview (when hovering, before clicking)
    if (aimingMode && !game.powerMeter.active) {
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
    
    // Draw confirmed target indicator and aim line (after first click)
    if (game.targetPos.set && game.powerMeter.active) {
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
    const boxY = canvas.height - 80;
    const boxWidth = 120;
    const boxHeight = 60;
    
    // Background box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    
    // Left arrow
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(boxX + 20, boxY + 30);
    ctx.lineTo(boxX + 10, boxY + 30);
    ctx.lineTo(boxX + 15, boxY + 25);
    ctx.moveTo(boxX + 10, boxY + 30);
    ctx.lineTo(boxX + 15, boxY + 35);
    ctx.stroke();
    
    // Right arrow
    ctx.beginPath();
    ctx.moveTo(boxX + 110, boxY + 30);
    ctx.lineTo(boxX + 120, boxY + 30);
    ctx.lineTo(boxX + 115, boxY + 25);
    ctx.moveTo(boxX + 120, boxY + 30);
    ctx.lineTo(boxX + 115, boxY + 35);
    ctx.stroke();
    
    // Draw club icon
    const iconX = boxX + 60;
    const iconY = boxY + 35;
    
    if (club.name === 'Putter') {
        // Putter - flat head
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(iconX, iconY - 15);
        ctx.lineTo(iconX, iconY);
        ctx.stroke();
        ctx.fillStyle = '#C0C0C0';
        ctx.fillRect(iconX - 6, iconY, 12, 3);
    } else if (club.name === 'Sand Wedge') {
        // Sand wedge - angled head
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(iconX, iconY - 15);
        ctx.lineTo(iconX, iconY);
        ctx.stroke();
        ctx.fillStyle = '#C0C0C0';
        ctx.beginPath();
        ctx.moveTo(iconX - 2, iconY);
        ctx.lineTo(iconX + 8, iconY + 3);
        ctx.lineTo(iconX + 8, iconY + 6);
        ctx.lineTo(iconX - 2, iconY + 3);
        ctx.fill();
    } else if (club.name === '7 Iron') {
        // 7 Iron - medium angled head
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(iconX, iconY - 15);
        ctx.lineTo(iconX, iconY);
        ctx.stroke();
        ctx.fillStyle = '#C0C0C0';
        ctx.beginPath();
        ctx.moveTo(iconX - 3, iconY);
        ctx.lineTo(iconX + 6, iconY + 2);
        ctx.lineTo(iconX + 6, iconY + 5);
        ctx.lineTo(iconX - 3, iconY + 3);
        ctx.fill();
    } else if (club.name === 'Driver') {
        // Driver - large round head
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(iconX, iconY - 15);
        ctx.lineTo(iconX, iconY - 3);
        ctx.stroke();
        ctx.fillStyle = '#C0C0C0';
        ctx.beginPath();
        ctx.arc(iconX + 3, iconY + 2, 6, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Club name
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(club.name, iconX, boxY + 55);
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
                x: 400, y: 280, 
                points: [
                    {x: 400, y: 290}, {x: 420, y: 280}, {x: 460, y: 280},
                    {x: 495, y: 285}, {x: 500, y: 310}, {x: 495, y: 350},
                    {x: 470, y: 360}, {x: 430, y: 360}, {x: 405, y: 350},
                    {x: 400, y: 320}
                ],
                direction: { x: 0, y: 0.3 } 
            }
        ];
    }
    else if (courseNumber === 2) {
        // Tropical Paradise - Par 5
        game.par = 5;
        game.tee = { x: 100, y: 300 };
        game.hole = { x: 750, y: 300 };
        GREEN_RADIUS = 40; // Narrow green
        
        obstacles.sandTraps = [];
        
        // River running through middle
        obstacles.waterHazards = [
            {
                points: [
                    {x: 350, y: 200}, {x: 380, y: 210}, {x: 400, y: 240},
                    {x: 410, y: 280}, {x: 420, y: 320}, {x: 430, y: 360},
                    {x: 440, y: 400}, {x: 420, y: 420}, {x: 390, y: 410},
                    {x: 370, y: 380}, {x: 360, y: 340}, {x: 350, y: 300},
                    {x: 340, y: 260}, {x: 330, y: 220}
                ]
            }
        ];
        
        // Palm trees
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
            { x: 640, y: 228, radius: 18, type: 'palm' },
            { x: 680, y: 235, radius: 18, type: 'palm' },
            { x: 720, y: 230, radius: 18, type: 'palm' },
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
            { x: 640, y: 372, radius: 18, type: 'palm' },
            { x: 680, y: 365, radius: 18, type: 'palm' },
            { x: 720, y: 370, radius: 18, type: 'palm' }
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
    aimingMode = false;
    updateUI();
}

// Start game
loadCourse(1); // Load default course
gameLoop();
