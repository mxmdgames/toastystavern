// --- Board setup ---
let board;
const rowCount = 13;
const columnCount = 20;
const tileSize = 32;
const boardWidth = columnCount * tileSize;   // 640
const boardHeight = rowCount * tileSize;     // 416
let context;

// Game objects
const walls = new Set();
let bartender;
const foodTypes = ["🍔","🍺","🌭"];
let score = 0;
let level = 1;
let levelTimer = 0;

// Movement
const keysPressed = new Set();
const speed = 5;

// Patron system
let activePatrons = [];
let patronQueue = [];
let spawnCooldown = 0;
let SPAWN_INTERVAL = 120;
let ORDER_DISPLAY_TIME = 180;
let maxPatrons = 2;

// Tile map
const tileMap = [
  "XXXXffffXXXXXXXXXXXX",
  "X        Ob        X",
  "X        Op       pX",
  "X        Oo       OX",
  "X    P   Op       oX",
  "X        Ob       bX",
  "X        Oo       OX",
  "X     OOOOp       OX",
  "X     p b         pX",
  "X                 bX",
  "X     p          pOX",
  "X    bOOo        oOX",
  "XXXXXXXXXXXXXXXXXXXX"
];

// --- Images ---
const imgBartender = new Image();
imgBartender.src = "./bartenderFront.png";

const imgTable = new Image();
imgTable.src = "./table.png";

const imgKitchen = new Image();
imgKitchen.src = "./kitchen.png";

const imgPatrons = {
  b: new Image(),
  p: new Image(),
  o: new Image()
};

imgPatrons.b.src = "./chibi.png";
imgPatrons.p.src = "./chibi.png";
imgPatrons.o.src = "./chibi.png";

const foodImages = {
  "🍔": new Image(),
  "🍺": new Image(),
  "🌭": new Image()
};

foodImages["🍔"].src = "./burger.png";
foodImages["🍺"].src = "./beer.png";
foodImages["🌭"].src = "./hotdog.png";

// --- INIT ---
window.onload = function () {
    board = document.getElementById("board");
    board.width  = boardWidth;
    board.height = boardHeight;
    context = board.getContext("2d");

    loadMap();
    update();

    document.addEventListener("keydown", (e) => keysPressed.add(e.code));
    document.addEventListener("keyup",   (e) => keysPressed.delete(e.code));

    setupMobileDPad();

    scaleCanvasToScreenHole();
    window.addEventListener("resize", scaleCanvasToScreenHole);
};

// --- SCALE CANVAS ---
function scaleCanvasToScreenHole() {
    const container = document.getElementById("arcade-container");
    if (!container) return;

    const holeW = container.clientWidth;
    const holeH = container.clientHeight;

    const scaleX = holeW / boardWidth;
    const scaleY = holeH / boardHeight;
    const scale  = Math.min(scaleX, scaleY);

    const scaledW = boardWidth * scale;
    const scaledH = boardHeight * scale;

    board.style.position = "absolute";
    board.style.width = scaledW + "px";
    board.style.height = scaledH + "px";

    board.style.left = ((holeW - scaledW) / 2) + "px";
    board.style.top  = ((holeH - scaledH) / 2) + "px";
}

// --- Load Map ---
function loadMap() {
  walls.clear();
  patronQueue = [];

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < columnCount; c++) {
      const tile = tileMap[r][c] || ' ';
      const x = c * tileSize;
      const y = r * tileSize;

      if (tile === 'X' || tile === 'O') walls.add(new Block(x, y));
      if (tile === 'P') bartender = new Block(x, y);

      if ("bpo".includes(tile)) {
        const chance = Math.min(1, 0.3 + 0.2 * level);
        if (Math.random() < chance) patronQueue.push({tile, r, c});
      }
    }
  }

  if (bartender) {
    bartender.foodTimer = 0;
    bartender.foodIndex = 0;
  }

  patronQueue = patronQueue.sort(() => Math.random() - 0.5);
}

// --- Game Loop ---
function update() {
  levelTimer++;
  move();
  updatePatrons();
  draw();
  requestAnimationFrame(update);
}

// --- Movement ---
function move() {
  if (!bartender) return;

  let vx = 0, vy = 0;
  if (keysPressed.has("ArrowUp") || keysPressed.has("KeyW")) vy -= 1;
  if (keysPressed.has("ArrowDown") || keysPressed.has("KeyS")) vy += 1;
  if (keysPressed.has("ArrowLeft") || keysPressed.has("KeyA")) vx -= 1;
  if (keysPressed.has("ArrowRight") || keysPressed.has("KeyD")) vx += 1;

  if (vx !== 0 || vy !== 0) {
    const len = Math.sqrt(vx*vx + vy*vy);
    vx = (vx / len) * speed;
    vy = (vy / len) * speed;
  }

  bartender.x += vx;
  bartender.y += vy;

  bartender.x = Math.max(0, Math.min(bartender.x, boardWidth - tileSize));
  bartender.y = Math.max(0, Math.min(bartender.y, boardHeight - tileSize));

  for (let wall of walls) {
    if (collision(bartender, wall)) {
      bartender.x -= vx;
      bartender.y -= vy;
      break;
    }
  }

  // food pickup
  const row = Math.floor(bartender.y / tileSize);
  const col = Math.floor(bartender.x / tileSize);

  if (tileMap[row][col] === 'f') {
    if (bartender.foodTimer <= 0) {
      bartender.foodIndex = (bartender.foodIndex + 1) % foodTypes.length;
      bartender.carrying = foodTypes[bartender.foodIndex];
      bartender.foodTimer = 100;
    } else bartender.foodTimer--;
  } else {
    bartender.foodTimer = 0;
  }

  // serving
  for (let p of activePatrons) {
    if (p.served) continue;
    if (collision(bartender, p)) {
      if (bartender.carrying === p.order) {
        p.served = true;
        bartender.carrying = null;
        score += 10;
      } else if (bartender.carrying) {
        score -= 5;
        bartender.carrying = null;
      }
    }
  }
}

// --- Patrons ---
function updatePatrons() {
  if (spawnCooldown <= 0 && patronQueue.length > 0 && activePatrons.length < maxPatrons) {
    const next = patronQueue.shift();
    const x = next.c * tileSize;
    const y = next.r * tileSize;

    activePatrons.push({
      x, y, width: tileSize, height: tileSize,
      order: foodTypes[Math.floor(Math.random() * foodTypes.length)],
      showOrder: true,
      timer: ORDER_DISPLAY_TIME,
      served: false,
      tile: next.tile
    });

    spawnCooldown = SPAWN_INTERVAL;
  } else spawnCooldown--;

  for (let p of activePatrons) {
    if (p.showOrder) {
      p.timer--;
      if (p.timer <= 0) p.showOrder = false;
    }
  }

  activePatrons = activePatrons.filter(p => !p.served);

  if (patronQueue.length === 0 && activePatrons.length === 0) nextLevel();
}

// --- Next Level ---
function nextLevel() {
  const seconds = Math.floor(levelTimer / 60);
  const bonus = Math.max(0, 300 - seconds);

  score += bonus;
  levelTimer = 0;

  level++;
  maxPatrons = Math.min(2 + level, 6);
  SPAWN_INTERVAL = Math.max(30, SPAWN_INTERVAL - 10);
  ORDER_DISPLAY_TIME = Math.max(60, ORDER_DISPLAY_TIME - 10);

  loadMap();
}

// --- Draw ---
function draw() {
  context.clearRect(0, 0, board.width, board.height);

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < columnCount; c++) {
      const x = c * tileSize;
      const y = r * tileSize;

      context.fillStyle = "#3a2615";
      context.fillRect(x, y, tileSize, tileSize);
    }
  }

  function drawImg(img, emoji, x, y, size) {
    if (img.complete && img.naturalWidth !== 0) {
      context.drawImage(img, x, y, size, size);
    } else {
      context.fillText(emoji, x+4, y+size-4);
    }
  }

  for (let wall of walls) {
    const t = tileMap[Math.floor(wall.y / tileSize)][Math.floor(wall.x / tileSize)];
    if (t === 'O') drawImg(imgTable, "🟫", wall.x, wall.y, tileSize);
  }

  drawImg(imgBartender, "🟡", bartender.x, bartender.y, tileSize);

  for (let p of activePatrons) {
    drawImg(imgPatrons[p.tile], "🙂", p.x, p.y, tileSize);
    if (p.showOrder) drawImg(foodImages[p.order], p.order, p.x, p.y - 24, 24);
  }
}

// --- Collision ---
function collision(a, b) {
  return a.x < b.x + b.width &&
         a.x + tileSize > b.x &&
         a.y < b.y + b.height &&
         a.y + tileSize > b.y;
}

// --- Block ---
class Block {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.width = tileSize;
    this.height = tileSize;
    this.carrying = null;
    this.foodTimer = 0;
    this.foodIndex = 0;
  }
}

// --- Mobile ---
function setupMobileDPad() {
  ["Up","Down","Left","Right"].forEach(dir => {
    const btn = document.getElementById(`dpad-${dir.toLowerCase()}`);
    if (!btn) return;

    btn.addEventListener("touchstart", (e) => {
      keysPressed.add("Arrow"+dir);
      e.preventDefault();
    });

    btn.addEventListener("touchend", (e) => {
      keysPressed.delete("Arrow"+dir);
      e.preventDefault();
    });
  });
}
