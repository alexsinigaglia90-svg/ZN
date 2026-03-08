const revealItems = document.querySelectorAll(".reveal");
const parallaxItems = document.querySelectorAll(".parallax-item");
const ambient = document.querySelector(".ambient-glow");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduceMotion && "IntersectionObserver" in window) {
	const observer = new IntersectionObserver(
		(entries, obs) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					entry.target.classList.add("is-visible");
					obs.unobserve(entry.target);
				}
			});
		},
		{ threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
	);

	revealItems.forEach((item) => observer.observe(item));
} else {
	revealItems.forEach((item) => item.classList.add("is-visible"));
}

if (!reduceMotion) {
	window.addEventListener("pointermove", (event) => {
		const x = event.clientX;
		const y = event.clientY;

		if (ambient) {
			ambient.style.transform = `translate(${x * 0.06}px, ${y * 0.05}px)`;
		}

		const cx = window.innerWidth / 2;
		const cy = window.innerHeight / 2;

		parallaxItems.forEach((item) => {
			const depth = Number(item.dataset.depth || 4);
			const offsetX = ((x - cx) / cx) * depth;
			const offsetY = ((y - cy) / cy) * depth;
			item.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
		});
	});
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function createTexture(factory) {
	const size = 256;
	const cvs = document.createElement("canvas");
	cvs.width = size;
	cvs.height = size;
	const ctx = cvs.getContext("2d", { willReadFrequently: true });
	factory(ctx, size);
	return ctx.getImageData(0, 0, size, size).data;
}

function sampleTexture(data, u, v, scale = 1) {
	const size = 256;
	const x = Math.floor((((u * scale) % 1 + 1) % 1) * (size - 1));
	const y = Math.floor((((v * scale) % 1 + 1) % 1) * (size - 1));
	const idx = (y * size + x) * 4;
	return [data[idx], data[idx + 1], data[idx + 2]];
}

class FabricPatch {
	constructor(config) {
		this.id = config.id;
		this.name = config.name;
		this.description = config.description;
		this.cols = 14;
		this.rows = 10;
		this.rect = { x: 0, y: 0, w: 10, h: 10 };
		this.hover = false;
		this.cornerLift = 0;
		this.cornerIndex = 0;
		this.material = config.material;
		this.texture = config.texture;
		this.points = Array.from({ length: this.cols * this.rows }, () => ({ z: 0, vz: 0 }));
	}

	index(i, j) {
		return j * this.cols + i;
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

	applyImpulse(nx, ny, force) {
		for (let j = 0; j < this.rows; j += 1) {
			for (let i = 0; i < this.cols; i += 1) {
				const u = i / (this.cols - 1);
				const v = j / (this.rows - 1);
				const dx = u - nx;
				const dy = v - ny;
				const dist = Math.sqrt(dx * dx + dy * dy);
				if (dist < 0.34) {
					const attn = (1 - dist / 0.34) ** 1.6;
					this.points[this.index(i, j)].vz += force * attn;
				}
			}
		}
	}

	applyCornerLift(nx, ny, amount) {
		const corners = [
			{ i: 0, j: 0, x: 0, y: 0 },
			{ i: this.cols - 1, j: 0, x: 1, y: 0 },
			{ i: 0, j: this.rows - 1, x: 0, y: 1 },
			{ i: this.cols - 1, j: this.rows - 1, x: 1, y: 1 },
		];

		let minDist = Infinity;
		let nearest = 0;

		corners.forEach((corner, idx) => {
			const dx = nx - corner.x;
			const dy = ny - corner.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < minDist) {
				minDist = dist;
				nearest = idx;
			}
		});

		if (minDist < 0.22) {
			this.cornerIndex = nearest;
			this.cornerLift = clamp(this.cornerLift + amount * this.material.cornerLift, 0, this.material.maxLift);
		}
	}

	update() {
		const stiffness = this.material.stiffness;
		const damping = this.material.damping;

		for (let j = 0; j < this.rows; j += 1) {
			for (let i = 0; i < this.cols; i += 1) {
				const idx = this.index(i, j);
				const point = this.points[idx];
				let neighborAvg = 0;
				let count = 0;

				if (i > 0) {
					neighborAvg += this.points[this.index(i - 1, j)].z;
					count += 1;
				}
				if (i < this.cols - 1) {
					neighborAvg += this.points[this.index(i + 1, j)].z;
					count += 1;
				}
				if (j > 0) {
					neighborAvg += this.points[this.index(i, j - 1)].z;
					count += 1;
				}
				if (j < this.rows - 1) {
					neighborAvg += this.points[this.index(i, j + 1)].z;
					count += 1;
				}

				if (count > 0) {
					neighborAvg /= count;
				}

				const springForce = (neighborAvg - point.z) * stiffness + -point.z * (stiffness * 0.58);
				point.vz = (point.vz + springForce) * damping;
				point.z += point.vz;
			}
		}

		if (this.cornerLift > 0.01) {
			const cornerMap = [
				{ x: 0, y: 0 },
				{ x: 1, y: 0 },
				{ x: 0, y: 1 },
				{ x: 1, y: 1 },
			];
			const corner = cornerMap[this.cornerIndex];

			for (let j = 0; j < this.rows; j += 1) {
				for (let i = 0; i < this.cols; i += 1) {
					const u = i / (this.cols - 1);
					const v = j / (this.rows - 1);
					const dx = u - corner.x;
					const dy = v - corner.y;
					const dist = Math.sqrt(dx * dx + dy * dy);
					if (dist < 0.45) {
						const attn = (1 - dist / 0.45) ** 2;
						this.points[this.index(i, j)].z += this.cornerLift * attn;
					}
				}
			}
			this.cornerLift *= 0.9;
		}
	}

	getPoint(i, j) {
		const point = this.points[this.index(i, j)];
		const x = this.rect.x + (i / (this.cols - 1)) * this.rect.w;
		const y = this.rect.y + (j / (this.rows - 1)) * this.rect.h + point.z;
		return { x, y, z: point.z };
	}

	draw(ctx, time) {
		const lightX = -0.48;
		const lightY = -0.42;

		for (let j = 0; j < this.rows - 1; j += 1) {
			for (let i = 0; i < this.cols - 1; i += 1) {
				const p00 = this.getPoint(i, j);
				const p10 = this.getPoint(i + 1, j);
				const p01 = this.getPoint(i, j + 1);
				const p11 = this.getPoint(i + 1, j + 1);

				const u = i / (this.cols - 1);
				const v = j / (this.rows - 1);
				const color = sampleTexture(this.texture, u + time * this.material.textureDrift, v, this.material.textureScale);

				const dx = (p10.z - p00.z) * 0.33;
				const dy = (p01.z - p00.z) * 0.33;
				let shade = 0.58 + dx * lightX - dy * lightY;
				shade = clamp(shade, 0.34, 1.26);

				let shimmer = 0;
				if (this.material.shimmer > 0) {
					const phase = Math.sin((u * 9 + v * 6 + time * 4) * this.material.shimmerFreq) * 0.5 + 0.5;
					shimmer = phase * this.material.shimmer;
				}

				const r = clamp(color[0] * shade + shimmer * 30, 0, 255);
				const g = clamp(color[1] * shade + shimmer * 28, 0, 255);
				const b = clamp(color[2] * shade + shimmer * 20, 0, 255);

				ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
				ctx.beginPath();
				ctx.moveTo(p00.x, p00.y);
				ctx.lineTo(p10.x, p10.y);
				ctx.lineTo(p11.x, p11.y);
				ctx.lineTo(p01.x, p01.y);
				ctx.closePath();
				ctx.fill();

				const foldShadow = clamp(Math.abs(dx) + Math.abs(dy), 0, 1) * this.material.shadow;
				if (foldShadow > 0.02) {
					ctx.strokeStyle = `rgba(28, 24, 20, ${foldShadow})`;
					ctx.lineWidth = 0.5;
					ctx.stroke();
				}
			}
		}

		ctx.save();
		ctx.globalAlpha = this.hover ? 0.28 : 0.14;
		ctx.strokeStyle = "rgba(255, 255, 255, 0.78)";
		ctx.lineWidth = this.hover ? 1.6 : 1;
		ctx.strokeRect(this.rect.x + 1, this.rect.y + 1, this.rect.w - 2, this.rect.h - 2);
		ctx.restore();
	}
}

function initFabricEngine() {
	const section = document.querySelector("#materials");
	const canvas = document.querySelector("#fabric-engine");
	const tooltip = document.querySelector("#fabric-tooltip");

	if (!section || !canvas || !tooltip || reduceMotion) {
		return;
	}

	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return;
	}

	const dprCap = 1.8;
	let width = 0;
	let height = 0;
	let raf = 0;
	let running = false;
	let hoverPatch = null;
	let pointerDown = false;
	let activePatch = null;
	let lastPointer = { x: 0, y: 0, t: 0 };
	let tooltipPatchId = "";

	const textures = {
		cashmere: createTexture((tCtx, size) => {
			tCtx.fillStyle = "#ccb69f";
			tCtx.fillRect(0, 0, size, size);
			for (let i = 0; i < 1300; i += 1) {
				tCtx.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
				tCtx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
			}
		}),
		wool: createTexture((tCtx, size) => {
			tCtx.fillStyle = "#9f8470";
			tCtx.fillRect(0, 0, size, size);
			tCtx.strokeStyle = "rgba(255,255,255,0.08)";
			for (let i = 0; i < size; i += 5) {
				tCtx.beginPath();
				tCtx.moveTo(i, 0);
				tCtx.lineTo(i + 30, size);
				tCtx.stroke();
			}
		}),
		silk: createTexture((tCtx, size) => {
			const grad = tCtx.createLinearGradient(0, 0, size, size);
			grad.addColorStop(0, "#cabdb6");
			grad.addColorStop(0.5, "#d8cfca");
			grad.addColorStop(1, "#bfb4ae");
			tCtx.fillStyle = grad;
			tCtx.fillRect(0, 0, size, size);
			for (let i = 0; i < size; i += 9) {
				tCtx.fillStyle = "rgba(255,255,255,0.05)";
				tCtx.fillRect(0, i, size, 2);
			}
		}),
		satin: createTexture((tCtx, size) => {
			const grad = tCtx.createLinearGradient(0, 0, size, 0);
			grad.addColorStop(0, "#b89c7e");
			grad.addColorStop(0.5, "#cbb292");
			grad.addColorStop(1, "#a18162");
			tCtx.fillStyle = grad;
			tCtx.fillRect(0, 0, size, size);
			for (let i = 0; i < size; i += 7) {
				tCtx.fillStyle = "rgba(255,255,255,0.04)";
				tCtx.fillRect(i, 0, 2, size);
			}
		}),
		leather: createTexture((tCtx, size) => {
			tCtx.fillStyle = "#493527";
			tCtx.fillRect(0, 0, size, size);
			for (let i = 0; i < 950; i += 1) {
				const alpha = Math.random() * 0.08;
				tCtx.fillStyle = `rgba(255,255,255,${alpha})`;
				const s = Math.random() * 2.4;
				tCtx.fillRect(Math.random() * size, Math.random() * size, s, s);
			}
		}),
		denim: createTexture((tCtx, size) => {
			tCtx.fillStyle = "#4f5f70";
			tCtx.fillRect(0, 0, size, size);
			tCtx.strokeStyle = "rgba(255,255,255,0.11)";
			for (let i = 0; i < size; i += 6) {
				tCtx.beginPath();
				tCtx.moveTo(i, 0);
				tCtx.lineTo(i, size);
				tCtx.stroke();
			}
			tCtx.strokeStyle = "rgba(0,0,0,0.08)";
			for (let i = 0; i < size; i += 7) {
				tCtx.beginPath();
				tCtx.moveTo(0, i);
				tCtx.lineTo(size, i);
				tCtx.stroke();
			}
		}),
	};

	const patches = [
		new FabricPatch({
			id: "kasjmier",
			name: "Kasjmier",
			description: "Zachte luxewol die uiterst zorgvuldig herstel vereist.",
			texture: textures.cashmere,
			material: { stiffness: 0.08, damping: 0.92, push: 0.9, drag: 0.85, wave: 1.15, cornerLift: 1.1, maxLift: 4.6, shadow: 0.17, shimmer: 0, shimmerFreq: 1, textureScale: 1.1, textureDrift: 0.002 },
		}),
		new FabricPatch({
			id: "wol",
			name: "Wol",
			description: "Elastisch materiaal met gecontroleerde terugveer en volume.",
			texture: textures.wool,
			material: { stiffness: 0.1, damping: 0.9, push: 0.75, drag: 0.7, wave: 0.95, cornerLift: 0.9, maxLift: 4.1, shadow: 0.19, shimmer: 0, shimmerFreq: 1, textureScale: 1.3, textureDrift: 0.0013 },
		}),
		new FabricPatch({
			id: "zijde",
			name: "Zijde",
			description: "Vloeiend materiaal met lichte glans en verfijnde gevoeligheid.",
			texture: textures.silk,
			material: { stiffness: 0.07, damping: 0.915, push: 1.02, drag: 1.05, wave: 1.2, cornerLift: 1.2, maxLift: 5.1, shadow: 0.16, shimmer: 0.45, shimmerFreq: 1.6, textureScale: 0.95, textureDrift: 0.0026 },
		}),
		new FabricPatch({
			id: "satijn",
			name: "Satijn",
			description: "Glad oppervlak met directionele lichtreflectie en soepele val.",
			texture: textures.satin,
			material: { stiffness: 0.08, damping: 0.91, push: 0.92, drag: 0.94, wave: 1.1, cornerLift: 1.05, maxLift: 4.7, shadow: 0.14, shimmer: 0.56, shimmerFreq: 2.1, textureScale: 1.05, textureDrift: 0.0023 },
		}),
		new FabricPatch({
			id: "leer",
			name: "Leer",
			description: "Stevige structuur met minimale vervorming en hoge precisiebehoefte.",
			texture: textures.leather,
			material: { stiffness: 0.18, damping: 0.86, push: 0.4, drag: 0.35, wave: 0.45, cornerLift: 0.45, maxLift: 2.4, shadow: 0.24, shimmer: 0.07, shimmerFreq: 1, textureScale: 1.15, textureDrift: 0.0008 },
		}),
		new FabricPatch({
			id: "denim",
			name: "Denim",
			description: "Zwaar textiel dat trager beweegt en robuust hersteld wordt.",
			texture: textures.denim,
			material: { stiffness: 0.14, damping: 0.875, push: 0.55, drag: 0.46, wave: 0.6, cornerLift: 0.62, maxLift: 3.1, shadow: 0.23, shimmer: 0, shimmerFreq: 1, textureScale: 1.2, textureDrift: 0.0009 },
		}),
	];

	function layoutPatches() {
		const w = width;
		const h = height;
		patches[0].setRect(0.05 * w, 0.08 * h, 0.25 * w, 0.26 * h);
		patches[1].setRect(0.34 * w, 0.05 * h, 0.27 * w, 0.3 * h);
		patches[2].setRect(0.68 * w, 0.12 * h, 0.24 * w, 0.24 * h);
		patches[3].setRect(0.11 * w, 0.43 * h, 0.26 * w, 0.25 * h);
		patches[4].setRect(0.43 * w, 0.37 * h, 0.31 * w, 0.3 * h);
		patches[5].setRect(0.76 * w, 0.5 * h, 0.2 * w, 0.29 * h);
	}

	function resize() {
		const bounds = canvas.getBoundingClientRect();
		const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
		width = Math.max(320, Math.floor(bounds.width));
		height = Math.max(360, Math.floor(bounds.height));
		canvas.width = Math.floor(width * dpr);
		canvas.height = Math.floor(height * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		layoutPatches();
	}

	function getCanvasPoint(event) {
		const rect = canvas.getBoundingClientRect();
		return {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
		};
	}

	function patchAt(x, y) {
		for (let i = patches.length - 1; i >= 0; i -= 1) {
			if (patches[i].contains(x, y)) {
				return patches[i];
			}
		}
		return null;
	}

	function setTooltip(patch, x, y) {
		if (!patch) {
			tooltipPatchId = "";
			tooltip.classList.remove("is-visible");
			tooltip.style.transform = "translate3d(-9999px,-9999px,0)";
			return;
		}

		if (tooltipPatchId !== patch.id) {
			tooltipPatchId = patch.id;
			tooltip.innerHTML = `<strong>${patch.name}</strong><br>${patch.description}`;
		}
		tooltip.classList.add("is-visible");
		const tx = clamp(x + 18, 12, width - 300);
		const ty = clamp(y + 20, 12, height - 120);
		tooltip.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
	}

	function pointerMove(event) {
		const point = getCanvasPoint(event);
		const now = performance.now();
		const dt = Math.max(16, now - lastPointer.t);
		const dx = point.x - lastPointer.x;
		const dy = point.y - lastPointer.y;
		const speed = Math.sqrt(dx * dx + dy * dy) / dt;
		lastPointer = { x: point.x, y: point.y, t: now };

		patches.forEach((patch) => {
			patch.hover = false;
		});

		const patch = patchAt(point.x, point.y);
		hoverPatch = patch;

		if (patch) {
			patch.hover = true;
			const nx = (point.x - patch.rect.x) / patch.rect.w;
			const ny = (point.y - patch.rect.y) / patch.rect.h;
			patch.applyImpulse(nx, ny, -0.32 * patch.material.push);

			if (speed > 0.95) {
				patch.applyImpulse(nx, ny, 0.42 * patch.material.wave);
			}

			if (pointerDown && activePatch === patch) {
				const dragForce = ((dx + dy) / 18) * patch.material.drag;
				patch.applyImpulse(nx, ny, dragForce);
				patch.applyCornerLift(nx, ny, Math.abs(dy) * 0.03);
			}
		}

		setTooltip(patch, point.x, point.y);
	}

	function pointerDownHandler(event) {
		pointerDown = true;
		canvas.classList.add("is-dragging");
		const point = getCanvasPoint(event);
		activePatch = patchAt(point.x, point.y);
	}

	function pointerUpHandler() {
		pointerDown = false;
		activePatch = null;
		canvas.classList.remove("is-dragging");
	}

	function pointerLeaveHandler() {
		pointerDown = false;
		activePatch = null;
		hoverPatch = null;
		patches.forEach((patch) => {
			patch.hover = false;
		});
		canvas.classList.remove("is-dragging");
		setTooltip(null, 0, 0);
	}

	function drawTableBackdrop() {
		const tableGradient = ctx.createLinearGradient(0, 0, width, height);
		tableGradient.addColorStop(0, "#d9c8b3");
		tableGradient.addColorStop(0.52, "#cbb197");
		tableGradient.addColorStop(1, "#b79779");
		ctx.fillStyle = tableGradient;
		ctx.fillRect(0, 0, width, height);

		ctx.save();
		ctx.globalAlpha = 0.06;
		ctx.fillStyle = "#ffffff";
		for (let y = 6; y < height; y += 18) {
			for (let x = (y % 36) * 0.4; x < width; x += 26) {
				ctx.fillRect(x, y, 1, 1);
			}
		}
		ctx.restore();

		ctx.strokeStyle = "rgba(28, 28, 28, 0.12)";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(width * 0.03, height * 0.08);
		ctx.lineTo(width * 0.94, height * 0.08);
		ctx.moveTo(width * 0.08, height * 0.88);
		ctx.lineTo(width * 0.97, height * 0.88);
		ctx.stroke();
	}

	function render(now) {
		const time = now * 0.001;
		ctx.clearRect(0, 0, width, height);
		drawTableBackdrop();

		for (const patch of patches) {
			patch.update();
			patch.draw(ctx, time);
		}

		if (hoverPatch) {
			ctx.save();
			ctx.strokeStyle = "rgba(214, 198, 165, 0.7)";
			ctx.setLineDash([6, 6]);
			ctx.lineWidth = 1;
			ctx.strokeRect(hoverPatch.rect.x - 4, hoverPatch.rect.y - 4, hoverPatch.rect.w + 8, hoverPatch.rect.h + 8);
			ctx.restore();
		}

		raf = window.requestAnimationFrame(render);
	}

	function start() {
		if (running) {
			return;
		}
		running = true;
		raf = window.requestAnimationFrame(render);
	}

	function stop() {
		if (!running) {
			return;
		}
		running = false;
		window.cancelAnimationFrame(raf);
	}

	resize();
	canvas.addEventListener("pointermove", pointerMove);
	canvas.addEventListener("pointerdown", pointerDownHandler);
	canvas.addEventListener("pointerup", pointerUpHandler);
	canvas.addEventListener("pointerleave", pointerLeaveHandler);
	window.addEventListener("pointerup", pointerUpHandler);
	window.addEventListener("resize", resize);

	if ("IntersectionObserver" in window) {
		const visibilityObserver = new IntersectionObserver(
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
		visibilityObserver.observe(section);
	} else {
		start();
	}
}

initFabricEngine();
