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
  const undoButton = document.querySelector("#hero-stitch-undo");
  const countNode = document.querySelector("#hero-stitch-count");
  const scoreNode = document.querySelector("#hero-stitch-score");
  const feedbackNode = document.querySelector("#hero-stitch-feedback");
  const patternSelect = document.querySelector("#hero-pattern-select");
  const threadSelect = document.querySelector("#hero-thread-select");
  const assistToggle = document.querySelector("#hero-assist-toggle");
  const completeCard = document.querySelector("#hero-complete-card");
  const completeScore = document.querySelector("#hero-complete-score");
  const completeNote = document.querySelector("#hero-complete-note");
  const studio = document.querySelector(".stitch-studio");

  if (!section || !canvas || !resetButton || !undoButton || !countNode || !scoreNode || !feedbackNode || !patternSelect || !threadSelect || !assistToggle || !completeCard || !completeScore || !completeNote || !studio) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dprMax = 2;
  let width = 0;
  let height = 0;
  let running = false;
  let raf = 0;
  let pointerDown = false;
  let points = [];
  let needle = { x: 0, y: 0, tx: 0, ty: 0, angle: 0, depth: 0 };
  let fabricRect = { x: 0, y: 0, w: 0, h: 0 };
  let glow = 0;
  let guidePath = [];
  let guideLength = 0;
  let currentPattern = "hem";
  let currentThread = "silk";
  let precision = 100;
  let isComplete = false;
  let completePulse = 0;
  let assistEnabled = false;
  let feedbackKey = "";
  let feedbackTimer = 0;

  const threadModes = {
    silk: { color: "#ddd4c8", shine: "rgba(255, 255, 255, 0.75)", shadow: "rgba(26, 22, 19, 0.26)", thickness: 2.2, stitchLen: 10, inertia: 0.22 },
    cotton: { color: "#d1c7b7", shine: "rgba(250, 248, 242, 0.62)", shadow: "rgba(24, 22, 18, 0.3)", thickness: 2.5, stitchLen: 11, inertia: 0.2 },
    technical: { color: "#bcc3cc", shine: "rgba(240, 244, 255, 0.6)", shadow: "rgba(18, 22, 30, 0.35)", thickness: 2.35, stitchLen: 9, inertia: 0.19 },
    heavy: { color: "#c2b29e", shine: "rgba(242, 230, 215, 0.5)", shadow: "rgba(22, 16, 13, 0.38)", thickness: 2.9, stitchLen: 13, inertia: 0.16 },
  };

  const patternLabels = {
    hem: "Rechte zoom",
    curve: "S-curve",
    corner: "Hoekafwerking",
  };

  function updateCount() {
    countNode.textContent = String(Math.max(0, points.length - 1));
  }

  function updateScore() {
    scoreNode.textContent = `${Math.round(precision)}%`;
  }

  function setFeedback(text) {
    feedbackNode.textContent = text;
  }

  function setFeedbackDebounced(key, text) {
    if (feedbackKey === key) return;
    feedbackKey = key;
    window.clearTimeout(feedbackTimer);
    feedbackTimer = window.setTimeout(() => {
      setFeedback(text);
    }, 120);
  }

  function buildGuidePath() {
    const path = [];
    const steps = 56;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      if (currentPattern === "hem") {
        const x = fabricRect.x + fabricRect.w * (0.14 + 0.72 * t);
        const y = fabricRect.y + fabricRect.h * 0.52;
        path.push({ x, y });
      } else if (currentPattern === "curve") {
        const x = fabricRect.x + fabricRect.w * (0.14 + 0.72 * t);
        const y = fabricRect.y + fabricRect.h * (0.52 + Math.sin(t * Math.PI * 2) * 0.1);
        path.push({ x, y });
      } else {
        const split = 0.52;
        if (t <= split) {
          const local = t / split;
          const x = fabricRect.x + fabricRect.w * (0.18 + 0.34 * local);
          const y = fabricRect.y + fabricRect.h * (0.76 - 0.48 * local);
          path.push({ x, y });
        } else {
          const local = (t - split) / (1 - split);
          const x = fabricRect.x + fabricRect.w * (0.52 + 0.3 * local);
          const y = fabricRect.y + fabricRect.h * (0.28 + 0.34 * local);
          path.push({ x, y });
        }
      }
    }
    guidePath = path;
    guideLength = path.length;
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

    buildGuidePath();

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

    ctx.save();
    const pulse = 0.24 + Math.sin(now * 0.0014) * 0.07;
    ctx.globalAlpha = points.length > 2 ? 0.14 : pulse;
    ctx.strokeStyle = "rgba(58, 42, 30, 0.65)";
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (guidePath[0]) {
      ctx.moveTo(guidePath[0].x, guidePath[0].y);
      for (let i = 1; i < guidePath.length; i += 1) {
        ctx.lineTo(guidePath[i].x, guidePath[i].y);
      }
    }
    ctx.stroke();
    ctx.restore();

    if (isComplete) {
      completePulse = clamp(completePulse + 0.05, 0, 1);
    } else {
      completePulse = clamp(completePulse - 0.04, 0, 1);
    }

    if (completePulse > 0.01) {
      ctx.save();
      ctx.globalAlpha = completePulse * 0.18;
      const shine = ctx.createLinearGradient(fabricRect.x, fabricRect.y, fabricRect.x + fabricRect.w, fabricRect.y);
      shine.addColorStop(0, "rgba(214, 198, 165, 0)");
      shine.addColorStop(0.5, "rgba(214, 198, 165, 0.95)");
      shine.addColorStop(1, "rgba(214, 198, 165, 0)");
      ctx.fillStyle = shine;
      ctx.fillRect(fabricRect.x, fabricRect.y, fabricRect.w, fabricRect.h);
      ctx.restore();
    }

    const interactionPulse = pointerDown ? 1 : glow;
    if (interactionPulse > 0.01) {
      ctx.save();
      ctx.globalAlpha = 0.06 + interactionPulse * 0.06;
      const cinematic = ctx.createLinearGradient(0, 0, width, height);
      cinematic.addColorStop(0, "rgba(255,255,255,0.45)");
      cinematic.addColorStop(0.4, "rgba(255,255,255,0.08)");
      cinematic.addColorStop(1, "rgba(58,42,30,0.18)");
      ctx.fillStyle = cinematic;
      ctx.fillRect(fabricRect.x, fabricRect.y, fabricRect.w, fabricRect.h);
      ctx.restore();
    }
  }

  function drawThread() {
    if (points.length < 2) return;

    const threadMode = threadModes[currentThread];

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = threadMode.shadow;
    ctx.lineWidth = threadMode.thickness + 1.6;
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

    ctx.strokeStyle = threadMode.color;
    ctx.lineWidth = threadMode.thickness;
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

    ctx.strokeStyle = threadMode.shine;
    ctx.lineWidth = Math.max(1, threadMode.thickness * 0.46);
    ctx.beginPath();
    ctx.moveTo(points[0].x - 0.4, points[0].y - 0.8);
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      ctx.quadraticCurveTo(a.x, a.y - 0.8, cx, cy - 0.8);
    }
    ctx.stroke();

    ctx.restore();

    const stitchSpacing = threadMode.stitchLen;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const segment = Math.hypot(b.x - a.x, b.y - a.y);
      if (segment < stitchSpacing * 0.75) continue;

      const angle = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const len = threadMode.thickness > 2.5 ? 6.5 : 5.5;

      ctx.strokeStyle = "rgba(28, 28, 28, 0.58)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx - Math.cos(angle) * len, my - Math.sin(angle) * len);
      ctx.lineTo(mx + Math.cos(angle) * len, my + Math.sin(angle) * len);
      ctx.stroke();
    }
  }

  function drawNeedle() {
    const threadMode = threadModes[currentThread];
    const dx = needle.tx - needle.x;
    const dy = needle.ty - needle.y;
    needle.x += dx * threadMode.inertia;
    needle.y += dy * threadMode.inertia;
    needle.angle = Math.atan2(dy, dx || 0.0001);

    if (pointerDown) {
      needle.depth = clamp(needle.depth + 0.12, 0, 1);
    } else {
      needle.depth = clamp(needle.depth - 0.09, 0, 1);
    }

    const puncture = Math.sin(performance.now() * 0.04) * 2.8 * needle.depth;

    ctx.save();
    ctx.translate(needle.x, needle.y + puncture);
    ctx.rotate(needle.angle);

    ctx.strokeStyle = "rgba(192, 192, 192, 0.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(24 + needle.depth * 1.2, 0);
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

  function distanceToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const lenSq = abx * abx + aby * aby || 1;
    const t = clamp((apx * abx + apy * aby) / lenSq, 0, 1);
    const qx = ax + abx * t;
    const qy = ay + aby * t;
    return Math.hypot(px - qx, py - qy);
  }

  function nearestGuideDistance(point) {
    let best = Infinity;
    for (let i = 1; i < guidePath.length; i += 1) {
      const a = guidePath[i - 1];
      const b = guidePath[i];
      const d = distanceToSegment(point.x, point.y, a.x, a.y, b.x, b.y);
      if (d < best) best = d;
    }
    return best;
  }

  function nearestGuidePoint(point) {
    let best = { x: point.x, y: point.y, d: Infinity };
    for (let i = 1; i < guidePath.length; i += 1) {
      const a = guidePath[i - 1];
      const b = guidePath[i];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const apx = point.x - a.x;
      const apy = point.y - a.y;
      const lenSq = abx * abx + aby * aby || 1;
      const t = clamp((apx * abx + apy * aby) / lenSq, 0, 1);
      const qx = a.x + abx * t;
      const qy = a.y + aby * t;
      const d = Math.hypot(point.x - qx, point.y - qy);
      if (d < best.d) best = { x: qx, y: qy, d };
    }
    return best;
  }

  function updatePrecisionAndFeedback() {
    if (points.length < 3) {
      precision = 100;
      updateScore();
      setFeedbackDebounced("intro", "Volg de gidslijn voor couture-precisie.");
      isComplete = false;
      studio.classList.remove("is-complete");
      completeCard.classList.remove("is-visible");
      return;
    }

    let total = 0;
    for (const point of points) {
      total += nearestGuideDistance(point);
    }
    const averageError = total / points.length;
    precision = clamp(100 - averageError * 3.2, 58, 100);
    updateScore();

    const firstGuide = guidePath[0];
    const lastGuide = guidePath[guidePath.length - 1];
    const startDist = Math.hypot(points[0].x - firstGuide.x, points[0].y - firstGuide.y);
    const endDist = Math.hypot(points[points.length - 1].x - lastGuide.x, points[points.length - 1].y - lastGuide.y);

    isComplete = points.length > 28 && startDist < 28 && endDist < 28;
    if (isComplete) {
      studio.classList.add("is-complete");
      if (precision > 90) setFeedbackDebounced("complete-hi", "Patroon voltooid. Uitzonderlijk nette afwerking.");
      else if (precision > 80) setFeedbackDebounced("complete-mid", "Patroon voltooid. Zeer nette afwerking.");
      else setFeedbackDebounced("complete-low", "Patroon voltooid. Mooie basis, nog strakker mogelijk.");

      completeScore.textContent = `${Math.round(precision)}%`;
      if (precision > 92) completeNote.textContent = "Couture-precisie bereikt.";
      else if (precision > 84) completeNote.textContent = "Sterke atelier-afwerking.";
      else completeNote.textContent = "Goede basis voor verdere verfijning.";
      completeCard.classList.add("is-visible");
      return;
    }

    studio.classList.remove("is-complete");
    completeCard.classList.remove("is-visible");
    if (precision > 92) setFeedbackDebounced("high", "Uitstekende spanning en lijncontrole.");
    else if (precision > 84) setFeedbackDebounced("mid-high", "Sterk naaiwerk. Houd dit ritme vast.");
    else if (precision > 74) setFeedbackDebounced("mid", "Goede richting. Werk met kleinere bewegingen.");
    else setFeedbackDebounced("low", "Nog te los. Volg de gidslijn rustiger.");
  }

  function addPoint(x, y) {
    let limitedX = clamp(x, fabricRect.x + 4, fabricRect.x + fabricRect.w - 4);
    let limitedY = clamp(y, fabricRect.y + 4, fabricRect.y + fabricRect.h - 4);

    if (assistEnabled) {
      const nearest = nearestGuidePoint({ x: limitedX, y: limitedY });
      if (nearest.d < 24) {
        const magnet = clamp(1 - nearest.d / 24, 0, 1) * 0.55;
        limitedX = limitedX + (nearest.x - limitedX) * magnet;
        limitedY = limitedY + (nearest.y - limitedY) * magnet;
      }
    }

    const lastPoint = points[points.length - 1];
    if (!lastPoint) {
      points.push({ x: limitedX, y: limitedY });
      updateCount();
      updatePrecisionAndFeedback();
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
      updatePrecisionAndFeedback();
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
    isComplete = false;
    completeCard.classList.remove("is-visible");
    updateCount();
    updatePrecisionAndFeedback();
  }

  function undoThread() {
    if (points.length < 2) return;
    points = points.slice(0, Math.max(0, points.length - 12));
    updateCount();
    updatePrecisionAndFeedback();
  }

  function handlePatternChange() {
    currentPattern = patternSelect.value;
    buildGuidePath();
    points = [];
    isComplete = false;
    completeCard.classList.remove("is-visible");
    updateCount();
    setFeedbackDebounced("pattern", `Patroon: ${patternLabels[currentPattern]}. Volg de gidslijn.`);
    updatePrecisionAndFeedback();
  }

  function handleThreadChange() {
    currentThread = threadSelect.value;
    setFeedbackDebounced("thread", `Draad gewijzigd naar ${threadSelect.options[threadSelect.selectedIndex].text.toLowerCase()}.`);
    updatePrecisionAndFeedback();
  }

  function handleAssistToggle() {
    assistEnabled = !assistEnabled;
    assistToggle.setAttribute("aria-pressed", String(assistEnabled));
    assistToggle.textContent = assistEnabled ? "Aan" : "Uit";
    setFeedbackDebounced("assist", assistEnabled ? "Assist actief. Naald helpt subtiel naar de gidslijn." : "Assist uit. Volledig handmatig naaiwerk.");
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
  updateScore();
  updatePrecisionAndFeedback();
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerdown", pointerDownHandler);
  canvas.addEventListener("pointerup", pointerUpHandler);
  canvas.addEventListener("pointerleave", pointerLeaveHandler);
  window.addEventListener("pointerup", pointerUpHandler);
  window.addEventListener("resize", resize);
  resetButton.addEventListener("click", resetThread);
  undoButton.addEventListener("click", undoThread);
  patternSelect.addEventListener("change", handlePatternChange);
  threadSelect.addEventListener("change", handleThreadChange);
  assistToggle.addEventListener("click", handleAssistToggle);

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
