/* js/design3d.js — aperçu 3D léger de formes primitives, sans dépendance externe. */
(function () {
  'use strict';
  const J = window.Jarvis;
  let canvas, ctx, yaw = -0.55, pitch = 0.45;

  function point(x, y, z) { return [x, y, z]; }

  function mesh(shape, width, height, depth) {
    const vertices = [];
    const triangles = [];
    const addTriangle = (a, b, c) => triangles.push([a, b, c]);

    if (shape === 'cube') {
      const x = width / 2, y = height / 2, z = depth / 2;
      vertices.push(
        point(-x, -y, -z), point(x, -y, -z), point(x, y, -z), point(-x, y, -z),
        point(-x, -y, z), point(x, -y, z), point(x, y, z), point(-x, y, z)
      );
      [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [0, 1, 5, 4], [3, 7, 6, 2]].forEach((face) => {
        addTriangle(face[0], face[1], face[2]);
        addTriangle(face[0], face[2], face[3]);
      });
    } else if (shape === 'cylinder') {
      const segments = 24;
      const topCenter = 0, bottomCenter = 1;
      vertices.push(point(0, height / 2, 0), point(0, -height / 2, 0));
      for (let i = 0; i < segments; i++) {
        const angle = i * Math.PI * 2 / segments;
        vertices.push(point(Math.cos(angle) * width / 2, height / 2, Math.sin(angle) * depth / 2));
        vertices.push(point(Math.cos(angle) * width / 2, -height / 2, Math.sin(angle) * depth / 2));
      }
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        const top = 2 + i * 2, bottom = top + 1;
        const nextTop = 2 + next * 2, nextBottom = nextTop + 1;
        addTriangle(topCenter, nextTop, top);
        addTriangle(bottomCenter, bottom, nextBottom);
        addTriangle(top, nextTop, nextBottom);
        addTriangle(top, nextBottom, bottom);
      }
    } else {
      const rings = 12, segments = 20;
      for (let lat = 0; lat <= rings; lat++) {
        const phi = -Math.PI / 2 + lat * Math.PI / rings;
        for (let lon = 0; lon <= segments; lon++) {
          const theta = lon * Math.PI * 2 / segments;
          vertices.push(point(
            Math.cos(phi) * Math.cos(theta) * width / 2,
            Math.sin(phi) * height / 2,
            Math.cos(phi) * Math.sin(theta) * depth / 2
          ));
        }
      }
      for (let lat = 0; lat < rings; lat++) {
        for (let lon = 0; lon < segments; lon++) {
          const a = lat * (segments + 1) + lon;
          const b = a + segments + 1;
          addTriangle(a, b, a + 1);
          addTriangle(a + 1, b, b + 1);
        }
      }
    }

    return { vertices, triangles };
  }

  function rotate(p) {
    const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
    const x = p[0] * cosYaw + p[2] * sinYaw;
    const z = -p[0] * sinYaw + p[2] * cosYaw;
    return [x, p[1] * cosPitch - z * sinPitch, p[1] * sinPitch + z * cosPitch];
  }

  function shadeColor(hex, amount) {
    const value = parseInt(hex.slice(1), 16);
    const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    return 'rgb(' + channels.map((channel) => Math.round(channel * amount)).join(',') + ')';
  }

  function render() {
    if (!canvas || !ctx || !canvas.clientWidth || !canvas.clientHeight) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth, height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const w = Number(J.$('design3d-width').value);
    const h = Number(J.$('design3d-height').value);
    const d = Number(J.$('design3d-depth').value);
    const model = mesh(J.$('design3d-shape').value, w, h, d);
    const rotated = model.vertices.map(rotate);
    const scale = Math.min(width, height) * 0.32 / Math.max(w, h, d);
    const centerX = width / 2, centerY = height / 2;
    const color = getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim() || '#00e5ff';
    const faces = model.triangles.map((triangle) => {
      const a = rotated[triangle[0]], b = rotated[triangle[1]], c = rotated[triangle[2]];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const normal = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0]
      ];
      const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
      const light = Math.max(0, (normal[0] * -0.4 + normal[1] * 0.7 + normal[2]) / length);
      return { points: [a, b, c], depth: (a[2] + b[2] + c[2]) / 3, shade: 0.28 + light * 0.65 };
    });
    faces.sort((a, b) => a.depth - b.depth);
    faces.forEach((face) => {
      ctx.beginPath();
      face.points.forEach((p, index) => {
        const x = centerX + p[0] * scale;
        const y = centerY - p[1] * scale;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = shadeColor(color, face.shade);
      ctx.globalAlpha = 0.62;
      ctx.fill();
      ctx.globalAlpha = 0.48;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  function init() {
    canvas = J.$('design3d-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    if (!ctx) {
      J.setNote('La conception 3D nécessite un navigateur compatible avec le canevas HTML.');
      return;
    }

    ['width', 'height', 'depth'].forEach((axis) => {
      const input = J.$('design3d-' + axis);
      const output = J.$('design3d-' + axis + '-value');
      input.addEventListener('input', () => {
        output.textContent = Number(input.value).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        render();
      });
    });
    J.$('design3d-shape').addEventListener('change', render);
    J.$('design3d-reset').addEventListener('click', () => {
      yaw = -0.55;
      pitch = 0.45;
      render();
    });

    let dragging = false, lastX = 0, lastY = 0;
    canvas.addEventListener('pointerdown', (event) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      yaw += (event.clientX - lastX) * 0.01;
      pitch = Math.max(-1.35, Math.min(1.35, pitch + (event.clientY - lastY) * 0.01));
      lastX = event.clientX;
      lastY = event.clientY;
      render();
    });
    canvas.addEventListener('pointerup', () => { dragging = false; });
    canvas.addEventListener('pointercancel', () => { dragging = false; });
    window.addEventListener('resize', render);
  }

  J.design3d = { init, render };
})();
