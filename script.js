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
		{
			threshold: 0.18,
			rootMargin: "0px 0px -8% 0px",
		}
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
