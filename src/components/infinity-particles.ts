/** Decorative canvas physics only; no product or pricing logic. */
export function animateInfinity(canvas: HTMLCanvasElement, host: HTMLElement) {
  const context = canvas.getContext('2d');
  if (!context) return { pause: (_paused: boolean) => {}, dispose: () => {} };
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const palette = getComputedStyle(host).getPropertyValue('--color-primary').trim() || '#0066cc';
  const particles = Array.from({ length: 1600 }, (_, index) => ({
    phase: (index / 1600) * Math.PI * 2,
    spread: Math.random() - 0.5,
    offset: Math.random() * Math.PI * 2,
    size: 0.6 + Math.random() * 1.2,
    opacity: 0.2 + Math.random() * 0.65,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
  }));
  let width = 0;
  let height = 0;
  let frame = 0;
  let previous = 0;
  let time = 0;
  let paused = false;
  let visible = true;
  let disposed = false;
  const pointer = { x: -1000, y: -1000 };

  function target(particle: (typeof particles)[number]) {
    const angle = particle.phase + time * 0.15;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    // A lemniscate: two connected orbits, with a softly breathing ribbon of particles.
    const denominator = 1 + sin * sin;
    const ribbon = particle.spread * (width < 600 ? 22 : 42);
    return {
      x: width / 2 + (width * 0.44 * cos) / denominator + Math.cos(particle.offset + time) * ribbon,
      y:
        height * 0.51 +
        (height * 0.74 * sin * cos) / denominator +
        Math.sin(particle.offset + time) * ribbon,
    };
  }

  function draw(delta: number, still = false) {
    if (!context) return;
    context.clearRect(0, 0, width, height);
    context.fillStyle = palette;
    for (const particle of particles) {
      const point = target(particle);
      if (still) {
        particle.x = point.x;
        particle.y = point.y;
        particle.vx = particle.vy = 0;
      } else {
        let ax = (point.x - particle.x) * 0.018;
        let ay = (point.y - particle.y) * 0.018;
        const dx = particle.x - pointer.x;
        const dy = particle.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 0 && distance < 125) {
          const force = (1 - distance / 125) * 1.8;
          ax += (dx / distance) * force;
          ay += (dy / distance) * force;
        }
        particle.vx = (particle.vx + ax * delta) * Math.pow(0.88, delta);
        particle.vy = (particle.vy + ay * delta) * Math.pow(0.88, delta);
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
      }
      context.globalAlpha = particle.opacity;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    // Sparse dust gives the space around the loop a little depth.
    context.globalAlpha = 0.18;
    for (let index = 0; index < 90; index++) {
      const x = (index * 137.51) % width;
      const y = (index * 83.17 + Math.sin(time * 0.25 + index) * 12 + height) % height;
      context.fillRect(x, y, 1.2, 1.2);
    }
    context.globalAlpha = 1;
  }

  function tick(now: number) {
    frame = 0;
    const delta = Math.min((now - (previous || now)) / 16.667, 2);
    previous = now;
    time += delta / 60;
    draw(delta);
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    if (disposed) return;
    if (motion.matches) draw(0, true);
    else if (!paused && visible && !document.hidden) frame = requestAnimationFrame(tick);
  }

  function resize() {
    const bounds = host.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw(0, true);
  }

  function move(event: PointerEvent) {
    if (event.pointerType === 'touch') return;
    const bounds = host.getBoundingClientRect();
    pointer.x = event.clientX - bounds.left;
    pointer.y = event.clientY - bounds.top;
  }

  function leave() {
    pointer.x = pointer.y = -1000;
  }

  const resizeObserver = new ResizeObserver(resize);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    sync();
  });
  resizeObserver.observe(host);
  intersectionObserver.observe(host);
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerleave', leave);
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', sync);
  resize();
  sync();

  return {
    pause(value: boolean) {
      paused = value;
      sync();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', sync);
      motion.removeEventListener('change', sync);
    },
  };
}
