const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function initReveal() {
  const items = document.querySelectorAll(".reveal");

  if (reduceMotion || !("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16, rootMargin: "0px 0px -7% 0px" }
  );

  items.forEach((item) => observer.observe(item));
}

function initAtmosphere() {
  if (reduceMotion) return;

  const glow = document.querySelector(".ambient-glow");
  const parallaxItems = document.querySelectorAll(".parallax-item");

  window.addEventListener("pointermove", (event) => {
    const x = event.clientX;
    const y = event.clientY;

    if (glow) {
      glow.style.transform = `translate(${x * 0.052}px, ${y * 0.048}px)`;
    }

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    parallaxItems.forEach((item) => {
      const depth = Number(item.dataset.depth || 3);
      const tx = ((x - cx) / cx) * depth;
      const ty = ((y - cy) / cy) * depth;
      item.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    });
  });
}

function initHeroStitchStudio() {
  const section = document.querySelector("#hero");
  const canvas = document.querySelector("#hero-stitch-canvas");
  const resetButton = document.querySelector("#hero-stitch-reset");
  const countNode = document.querySelector("#hero-stitch-count");

  if (!section || !canvas || !resetButton || !countNode) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dprMax = 2;
  let width = 0;
  let height = 0;
  let running = false;
  let raf = 0;
  let pointerDown = false;
  let points = [];
  let needle = { x: 0, y: 0, tx: 0, ty: 0, angle: 0 };
  let fabricRect = { x: 0, y: 0, w: 0, h: 0 };
  let glow = 0;

  function updateCount() {
    countNode.textContent = String(Math.max(0, points.length - 1));
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(300, Math.floor(rect.width));
    height = Math.max(300, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, dprMax);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    fabricRect = {
      x: width * 0.12,
      y: height * 0.16,
      w: width * 0.76,
      h: height * 0.68,
    };

    if (needle.x === 0 && needle.y === 0) {
      needle.x = fabricRect.x + fabricRect.w * 0.5;
      needle.y = fabricRect.y + fabricRect.h * 0.5;
      needle.tx = needle.x;
      needle.ty = needle.y;
    }
  }

  function isInsideFabric(x, y) {
    return x >= fabricRect.x && x <= fabricRect.x + fabricRect.w && y >= fabricRect.y && y <= fabricRect.y + fabricRect.h;
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function drawBackground(now) {
    const table = ctx.createLinearGradient(0, 0, width, height);
    table.addColorStop(0, "#deccb6");
    table.addColorStop(0.5, "#ceb79c");
    table.addColorStop(1, "#ba9e80");
    ctx.fillStyle = table;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = "#ffffff";
    for (let y = 10; y < height; y += 20) {
      for (let x = (y % 30) * 0.5; x < width; x += 26) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.restore();

    const g = ctx.createLinearGradient(fabricRect.x, fabricRect.y, fabricRect.x + fabricRect.w, fabricRect.y + fabricRect.h);
    g.addColorStop(0, "#d8cebf");
    g.addColorStop(1, "#c6b9a8");
    ctx.fillStyle = g;
    ctx.fillRect(fabricRect.x, fabricRect.y, fabricRect.w, fabricRect.h);

    ctx.strokeStyle = "rgba(28, 28, 28, 0.17)";
    ctx.lineWidth = 1;
    ctx.strokeRect(fabricRect.x + 0.5, fabricRect.y + 0.5, fabricRect.w - 1, fabricRect.h - 1);

    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.strokeStyle = "#ffffff";
    for (let i = 0; i < 22; i += 1) {
      const x = fabricRect.x + (i / 22) * fabricRect.w;
      ctx.beginPath();
      ctx.moveTo(x, fabricRect.y);
      ctx.lineTo(x - 32, fabricRect.y + fabricRect.h);
      ctx.stroke();
    }
    ctx.restore();

    if (points.length < 2) {
      ctx.save();
      ctx.globalAlpha = 0.26 + Math.sin(now * 0.0014) * 0.08;
      ctx.strokeStyle = "rgba(58, 42, 30, 0.6)";
      ctx.setLineDash([6, 7]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fabricRect.x + fabricRect.w * 0.2, fabricRect.y + fabricRect.h * 0.52);
      ctx.bezierCurveTo(
        fabricRect.x + fabricRect.w * 0.38,
        fabricRect.y + fabricRect.h * 0.34,
        fabricRect.x + fabricRect.w * 0.62,
        fabricRect.y + fabricRect.h * 0.68,
        fabricRect.x + fabricRect.w * 0.8,
        fabricRect.y + fabricRect.h * 0.5
      );
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawThread() {
    if (points.length < 2) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = "rgba(32, 28, 24, 0.26)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(points[0].x + 1, points[0].y + 1.5);
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      ctx.quadraticCurveTo(a.x, a.y, cx, cy);
    }
    ctx.stroke();

    ctx.strokeStyle = "#d9d0c4";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      ctx.quadraticCurveTo(a.x, a.y, cx, cy);
    }
    ctx.stroke();

    ctx.restore();

    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const angle = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const len = 6;

      ctx.strokeStyle = "rgba(28, 28, 28, 0.58)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx - Math.cos(angle) * len, my - Math.sin(angle) * len);
      ctx.lineTo(mx + Math.cos(angle) * len, my + Math.sin(angle) * len);
      ctx.stroke();
    }
  }

  function drawNeedle() {
    const dx = needle.tx - needle.x;
    const dy = needle.ty - needle.y;
    needle.x += dx * 0.22;
    needle.y += dy * 0.22;
    needle.angle = Math.atan2(dy, dx || 0.0001);

    ctx.save();
    ctx.translate(needle.x, needle.y);
    ctx.rotate(needle.angle);

    ctx.strokeStyle = "rgba(192, 192, 192, 0.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(24, 0);
    ctx.stroke();

    ctx.fillStyle = "rgba(214, 198, 165, 0.95)";
    ctx.beginPath();
    ctx.arc(-18, 0, 2.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(28, 28, 28, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(-18, 0, 4.3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    if (pointerDown) {
      glow = clamp(glow + 0.08, 0, 1);
    } else {
      glow = clamp(glow - 0.05, 0, 1);
    }

    if (glow > 0.01) {
      ctx.save();
      ctx.globalAlpha = glow * 0.2;
      const radial = ctx.createRadialGradient(needle.x, needle.y, 4, needle.x, needle.y, 34);
      radial.addColorStop(0, "rgba(214, 198, 165, 0.95)");
      radial.addColorStop(1, "rgba(214, 198, 165, 0)");
      ctx.fillStyle = radial;
      ctx.beginPath();
      ctx.arc(needle.x, needle.y, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function render(now) {
    drawBackground(now);
    drawThread();
    drawNeedle();
    raf = requestAnimationFrame(render);
  }

  function addPoint(x, y) {
    const limitedX = clamp(x, fabricRect.x + 4, fabricRect.x + fabricRect.w - 4);
    const limitedY = clamp(y, fabricRect.y + 4, fabricRect.y + fabricRect.h - 4);

    const lastPoint = points[points.length - 1];
    if (!lastPoint) {
      points.push({ x: limitedX, y: limitedY });
      updateCount();
      return;
    }

    const dx = limitedX - lastPoint.x;
    const dy = limitedY - lastPoint.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 9) {
      points.push({ x: limitedX, y: limitedY });
      if (points.length > 180) {
        points = points.slice(points.length - 180);
      }
      updateCount();
    }
  }

  function pointerMove(event) {
    const p = canvasPoint(event);
    needle.tx = p.x;
    needle.ty = p.y;

    if (pointerDown && isInsideFabric(p.x, p.y)) {
      addPoint(p.x, p.y);
    }
  }

  function pointerDownHandler(event) {
    const p = canvasPoint(event);
    pointerDown = true;
    canvas.classList.add("is-sewing");
    needle.tx = p.x;
    needle.ty = p.y;

    if (isInsideFabric(p.x, p.y)) {
      addPoint(p.x, p.y);
    }
  }

  function pointerUpHandler() {
    pointerDown = false;
    canvas.classList.remove("is-sewing");
  }

  function pointerLeaveHandler() {
    pointerDown = false;
    canvas.classList.remove("is-sewing");
  }

  function resetThread() {
    points = [];
    updateCount();
  }

  function start() {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(render);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
  }

  resize();
  updateCount();
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerdown", pointerDownHandler);
  canvas.addEventListener("pointerup", pointerUpHandler);
  canvas.addEventListener("pointerleave", pointerLeaveHandler);
  window.addEventListener("pointerup", pointerUpHandler);
  window.addEventListener("resize", resize);
  resetButton.addEventListener("click", resetThread);

  if ("IntersectionObserver" in window && !reduceMotion) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) start();
          else stop();
        });
      },
      { threshold: 0.16 }
    );
    observer.observe(section);
  } else {
    start();
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createTexture(draw) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  draw(ctx, size);
  return ctx.getImageData(0, 0, size, size).data;
}

function sampleTexture(data, u, v, scale) {
  const size = 256;
  const x = Math.floor((((u * scale) % 1 + 1) % 1) * (size - 1));
  const y = Math.floor((((v * scale) % 1 + 1) % 1) * (size - 1));
  const index = (y * size + x) * 4;
  return [data[index], data[index + 1], data[index + 2]];
}

class ClothPatch {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.texture = config.texture;
    this.behavior = config.behavior;

    this.cols = 13;
    this.rows = 9;
    this.rect = { x: 0, y: 0, w: 20, h: 20 };
    this.nodes = Array.from({ length: this.cols * this.rows }, () => ({ z: 0, vz: 0 }));
    this.hover = false;
    this.lift = 0;
    this.activeCorner = 0;
  }

  setRect(x, y, w, h) {
    this.rect.x = x;
    this.rect.y = y;
    this.rect.w = w;
    this.rect.h = h;
  }

  contains(x, y) {
    return x >= this.rect.x && x <= this.rect.x + this.rect.w && y >= this.rect.y && y <= this.rect.y + this.rect.h;
  }

  nodeIndex(i, j) {
    return j * this.cols + i;
  }

  impulse(nx, ny, amount) {
    for (let j = 0; j < this.rows; j += 1) {
      for (let i = 0; i < this.cols; i += 1) {
        const u = i / (this.cols - 1);
        const v = j / (this.rows - 1);
        const dx = u - nx;
        const dy = v - ny;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 0.34) {
          const strength = (1 - distance / 0.34) ** 1.7;
          this.nodes[this.nodeIndex(i, j)].vz += amount * strength;
        }
      }
    }
  }

  liftCorner(nx, ny, amount) {
    const corners = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ];

    let nearest = 0;
    let best = Infinity;

    corners.forEach((corner, index) => {
      const dx = nx - corner.x;
      const dy = ny - corner.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });

    if (best < 0.21) {
      this.activeCorner = nearest;
      this.lift = clamp(this.lift + amount * this.behavior.cornerFactor, 0, this.behavior.maxLift);
    }
  }

  update() {
    const spring = this.behavior.spring;
    const damping = this.behavior.damping;

    for (let j = 0; j < this.rows; j += 1) {
      for (let i = 0; i < this.cols; i += 1) {
        const idx = this.nodeIndex(i, j);
        const node = this.nodes[idx];

        let total = 0;
        let count = 0;

        if (i > 0) {
          total += this.nodes[this.nodeIndex(i - 1, j)].z;
          count += 1;
        }
        if (i < this.cols - 1) {
          total += this.nodes[this.nodeIndex(i + 1, j)].z;
          count += 1;
        }
        if (j > 0) {
          total += this.nodes[this.nodeIndex(i, j - 1)].z;
          count += 1;
        }
        if (j < this.rows - 1) {
          total += this.nodes[this.nodeIndex(i, j + 1)].z;
          count += 1;
        }

        const average = count > 0 ? total / count : 0;
        const pull = (average - node.z) * spring + -node.z * spring * 0.58;
        node.vz = (node.vz + pull) * damping;
        node.z += node.vz;
      }
    }

    if (this.lift > 0.01) {
      const corners = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ];
      const corner = corners[this.activeCorner];

      for (let j = 0; j < this.rows; j += 1) {
        for (let i = 0; i < this.cols; i += 1) {
          const u = i / (this.cols - 1);
          const v = j / (this.rows - 1);
          const dx = u - corner.x;
          const dy = v - corner.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 0.44) {
            const weight = (1 - dist / 0.44) ** 2;
            this.nodes[this.nodeIndex(i, j)].z += this.lift * weight;
          }
        }
      }

      this.lift *= 0.89;
    }
  }

  point(i, j) {
    const node = this.nodes[this.nodeIndex(i, j)];
    return {
      x: this.rect.x + (i / (this.cols - 1)) * this.rect.w,
      y: this.rect.y + (j / (this.rows - 1)) * this.rect.h + node.z,
      z: node.z,
    };
  }

  draw(ctx, time) {
    const lx = -0.46;
    const ly = -0.4;

    for (let j = 0; j < this.rows - 1; j += 1) {
      for (let i = 0; i < this.cols - 1; i += 1) {
        const p00 = this.point(i, j);
        const p10 = this.point(i + 1, j);
        const p01 = this.point(i, j + 1);
        const p11 = this.point(i + 1, j + 1);

        const u = i / (this.cols - 1);
        const v = j / (this.rows - 1);
        const base = sampleTexture(this.texture, u + time * this.behavior.drift, v, this.behavior.scale);

        const nx = (p10.z - p00.z) * 0.34;
        const ny = (p01.z - p00.z) * 0.34;
        let shade = 0.6 + nx * lx - ny * ly;
        shade = clamp(shade, 0.36, 1.26);

        let shimmer = 0;
        if (this.behavior.shimmer > 0) {
          shimmer = (Math.sin((u * 9 + v * 7 + time * 4) * this.behavior.shimmerFreq) * 0.5 + 0.5) * this.behavior.shimmer;
        }

        const r = clamp(base[0] * shade + shimmer * 30, 0, 255);
        const g = clamp(base[1] * shade + shimmer * 28, 0, 255);
        const b = clamp(base[2] * shade + shimmer * 24, 0, 255);

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.beginPath();
        ctx.moveTo(p00.x, p00.y);
        ctx.lineTo(p10.x, p10.y);
        ctx.lineTo(p11.x, p11.y);
        ctx.lineTo(p01.x, p01.y);
        ctx.closePath();
        ctx.fill();

        const fold = clamp((Math.abs(nx) + Math.abs(ny)) * this.behavior.shadow, 0, 0.42);
        if (fold > 0.03) {
          ctx.strokeStyle = `rgba(25, 22, 18, ${fold})`;
          ctx.lineWidth = 0.55;
          ctx.stroke();
        }
      }
    }

    ctx.save();
    ctx.globalAlpha = this.hover ? 0.3 : 0.14;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.86)";
    ctx.lineWidth = this.hover ? 1.5 : 1;
    ctx.strokeRect(this.rect.x + 1, this.rect.y + 1, this.rect.w - 2, this.rect.h - 2);
    ctx.restore();
  }
}

function initFabricEngine() {
  const section = document.querySelector("#materials");
  const canvas = document.querySelector("#fabric-engine");
  const tooltip = document.querySelector("#fabric-tooltip");
  if (!section || !canvas || !tooltip || reduceMotion) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dprMax = 1.8;
  let width = 0;
  let height = 0;
  let running = false;
  let raf = 0;
  let pointerDown = false;
  let activePatch = null;
  let hoveredPatch = null;
  let currentTooltip = "";
  let last = { x: 0, y: 0, t: 0 };

  const textures = {
    cashmere: createTexture((t, s) => {
      t.fillStyle = "#cab39c";
      t.fillRect(0, 0, s, s);
      for (let i = 0; i < 1500; i += 1) {
        t.fillStyle = `rgba(255,255,255,${Math.random() * 0.045})`;
        t.fillRect(Math.random() * s, Math.random() * s, 1, 1);
      }
    }),
    wool: createTexture((t, s) => {
      t.fillStyle = "#9a806a";
      t.fillRect(0, 0, s, s);
      t.strokeStyle = "rgba(255,255,255,0.08)";
      for (let i = 0; i < s; i += 5) {
        t.beginPath();
        t.moveTo(i, 0);
        t.lineTo(i + 24, s);
        t.stroke();
      }
    }),
    silk: createTexture((t, s) => {
      const g = t.createLinearGradient(0, 0, s, s);
      g.addColorStop(0, "#ccc0b8");
      g.addColorStop(0.5, "#ded4ce");
      g.addColorStop(1, "#b9aca5");
      t.fillStyle = g;
      t.fillRect(0, 0, s, s);
    }),
    satin: createTexture((t, s) => {
      const g = t.createLinearGradient(0, 0, s, 0);
      g.addColorStop(0, "#b58f6d");
      g.addColorStop(0.45, "#d0b18f");
      g.addColorStop(1, "#9f7b5a");
      t.fillStyle = g;
      t.fillRect(0, 0, s, s);
      for (let i = 0; i < s; i += 8) {
        t.fillStyle = "rgba(255,255,255,0.04)";
        t.fillRect(i, 0, 2, s);
      }
    }),
    leather: createTexture((t, s) => {
      t.fillStyle = "#4a3526";
      t.fillRect(0, 0, s, s);
      for (let i = 0; i < 1050; i += 1) {
        const a = Math.random() * 0.08;
        const r = Math.random() * 2.2;
        t.fillStyle = `rgba(255,255,255,${a})`;
        t.fillRect(Math.random() * s, Math.random() * s, r, r);
      }
    }),
    denim: createTexture((t, s) => {
      t.fillStyle = "#4f6072";
      t.fillRect(0, 0, s, s);
      t.strokeStyle = "rgba(255,255,255,0.1)";
      for (let i = 0; i < s; i += 6) {
        t.beginPath();
        t.moveTo(i, 0);
        t.lineTo(i, s);
        t.stroke();
      }
      t.strokeStyle = "rgba(0,0,0,0.08)";
      for (let i = 0; i < s; i += 8) {
        t.beginPath();
        t.moveTo(0, i);
        t.lineTo(s, i);
        t.stroke();
      }
    }),
  };

  const patches = [
    new ClothPatch({
      id: "kasjmier",
      name: "Kasjmier",
      description: "Zachte luxewol die uiterst zorgvuldig herstel vereist.",
      texture: textures.cashmere,
      behavior: { spring: 0.082, damping: 0.92, push: 0.9, drag: 0.85, wave: 1.12, cornerFactor: 1.1, maxLift: 4.5, shadow: 0.18, shimmer: 0, shimmerFreq: 1, scale: 1.08, drift: 0.0018 },
    }),
    new ClothPatch({
      id: "wol",
      name: "Wol",
      description: "Elastische vezelstructuur met gecontroleerde terugveer.",
      texture: textures.wool,
      behavior: { spring: 0.097, damping: 0.902, push: 0.77, drag: 0.7, wave: 0.94, cornerFactor: 0.92, maxLift: 4.0, shadow: 0.2, shimmer: 0, shimmerFreq: 1, scale: 1.22, drift: 0.0012 },
    }),
    new ClothPatch({
      id: "zijde",
      name: "Zijde",
      description: "Vloeiend materiaal met subtiele glans en fijne val.",
      texture: textures.silk,
      behavior: { spring: 0.072, damping: 0.915, push: 1.01, drag: 1.03, wave: 1.2, cornerFactor: 1.2, maxLift: 5.1, shadow: 0.16, shimmer: 0.46, shimmerFreq: 1.6, scale: 0.96, drift: 0.0024 },
    }),
    new ClothPatch({
      id: "satijn",
      name: "Satijn",
      description: "Gladde binding met directionele lichtreflectie.",
      texture: textures.satin,
      behavior: { spring: 0.082, damping: 0.91, push: 0.93, drag: 0.95, wave: 1.07, cornerFactor: 1.05, maxLift: 4.7, shadow: 0.14, shimmer: 0.56, shimmerFreq: 2.1, scale: 1.04, drift: 0.0021 },
    }),
    new ClothPatch({
      id: "leer",
      name: "Leer",
      description: "Stevig materiaal met minimale vervorming en hoge precisie-eis.",
      texture: textures.leather,
      behavior: { spring: 0.17, damping: 0.86, push: 0.4, drag: 0.34, wave: 0.45, cornerFactor: 0.44, maxLift: 2.35, shadow: 0.24, shimmer: 0.06, shimmerFreq: 1, scale: 1.14, drift: 0.0008 },
    }),
    new ClothPatch({
      id: "denim",
      name: "Denim",
      description: "Zwaar textiel dat trager reageert en robuust herstel vraagt.",
      texture: textures.denim,
      behavior: { spring: 0.14, damping: 0.875, push: 0.56, drag: 0.47, wave: 0.61, cornerFactor: 0.6, maxLift: 3.05, shadow: 0.23, shimmer: 0, shimmerFreq: 1, scale: 1.2, drift: 0.0009 },
    }),
  ];

  function layout() {
    patches[0].setRect(width * 0.055, height * 0.09, width * 0.25, height * 0.25);
    patches[1].setRect(width * 0.34, height * 0.06, width * 0.28, height * 0.28);
    patches[2].setRect(width * 0.685, height * 0.12, width * 0.245, height * 0.24);
    patches[3].setRect(width * 0.095, height * 0.44, width * 0.265, height * 0.25);
    patches[4].setRect(width * 0.425, height * 0.39, width * 0.31, height * 0.295);
    patches[5].setRect(width * 0.765, height * 0.5, width * 0.2, height * 0.29);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(340, Math.floor(rect.width));
    height = Math.max(420, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, dprMax);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout();
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function findPatch(x, y) {
    for (let i = patches.length - 1; i >= 0; i -= 1) {
      if (patches[i].contains(x, y)) return patches[i];
    }
    return null;
  }

  function setTooltip(patch, x, y) {
    if (!patch) {
      currentTooltip = "";
      tooltip.classList.remove("is-visible");
      tooltip.style.transform = "translate3d(-9999px,-9999px,0)";
      return;
    }

    if (currentTooltip !== patch.id) {
      currentTooltip = patch.id;
      tooltip.innerHTML = `<strong>${patch.name}</strong><br>${patch.description}`;
    }

    tooltip.classList.add("is-visible");
    const tx = clamp(x + 16, 12, width - 308);
    const ty = clamp(y + 18, 12, height - 124);
    tooltip.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
  }

  function onPointerMove(event) {
    const p = pointFromEvent(event);
    const now = performance.now();
    const dt = Math.max(16, now - last.t);
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    const speed = Math.sqrt(dx * dx + dy * dy) / dt;
    last = { x: p.x, y: p.y, t: now };

    patches.forEach((patch) => {
      patch.hover = false;
    });

    const patch = findPatch(p.x, p.y);
    hoveredPatch = patch;

    if (patch) {
      patch.hover = true;
      const nx = (p.x - patch.rect.x) / patch.rect.w;
      const ny = (p.y - patch.rect.y) / patch.rect.h;

      patch.impulse(nx, ny, -0.32 * patch.behavior.push);

      if (speed > 0.9) {
        patch.impulse(nx, ny, 0.4 * patch.behavior.wave);
      }

      if (pointerDown && activePatch === patch) {
        patch.impulse(nx, ny, ((dx + dy) / 18) * patch.behavior.drag);
        patch.liftCorner(nx, ny, Math.abs(dy) * 0.028);
      }
    }

    setTooltip(patch, p.x, p.y);
  }

  function onPointerDown(event) {
    pointerDown = true;
    canvas.classList.add("is-dragging");
    const p = pointFromEvent(event);
    activePatch = findPatch(p.x, p.y);
  }

  function onPointerUp() {
    pointerDown = false;
    activePatch = null;
    canvas.classList.remove("is-dragging");
  }

  function onPointerLeave() {
    pointerDown = false;
    activePatch = null;
    hoveredPatch = null;
    canvas.classList.remove("is-dragging");
    patches.forEach((patch) => {
      patch.hover = false;
    });
    setTooltip(null, 0, 0);
  }

  function drawTable() {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#dac8b1");
    gradient.addColorStop(0.5, "#cbb197");
    gradient.addColorStop(1, "#ba9b7e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = "#ffffff";
    for (let y = 8; y < height; y += 18) {
      for (let x = (y % 34) * 0.45; x < width; x += 24) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(28,28,28,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width * 0.04, height * 0.09);
    ctx.lineTo(width * 0.95, height * 0.09);
    ctx.moveTo(width * 0.08, height * 0.89);
    ctx.lineTo(width * 0.97, height * 0.89);
    ctx.stroke();
  }

  function render(now) {
    const time = now * 0.001;
    ctx.clearRect(0, 0, width, height);
    drawTable();

    patches.forEach((patch) => {
      patch.update();
      patch.draw(ctx, time);
    });

    if (hoveredPatch) {
      ctx.save();
      ctx.strokeStyle = "rgba(214, 198, 165, 0.72)";
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1;
      ctx.strokeRect(hoveredPatch.rect.x - 4, hoveredPatch.rect.y - 4, hoveredPatch.rect.w + 8, hoveredPatch.rect.h + 8);
      ctx.restore();
    }

    raf = requestAnimationFrame(render);
  }

  function start() {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(render);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
  }

  resize();
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("resize", resize);

  if ("IntersectionObserver" in window) {
    const visibility = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            start();
          } else {
            stop();
          }
        });
      },
      { threshold: 0.14 }
    );
    visibility.observe(section);
  } else {
    start();
  }
}

initReveal();
initAtmosphere();
initHeroStitchStudio();
initFabricEngine();
