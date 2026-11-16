(() => {
  'use strict';

  /* =========================================================
     CONFIG
     ========================================================= */
  const FRAME_COUNT = 248;
  const INTRO_FRAMES = 86;   // muro → puño → salto (clip generado) antes de empalmar con el video
  const FPS = 24;
  // Un solo archivo de video (todos los cuadros son keyframes → se puede adelantar
  // y retroceder cuadro a cuadro). 1920px en escritorio, 1280px en móvil.
  const VIDEO_SRC = window.matchMedia('(max-width: 820px)').matches ? 'hero-m.mp4?v=5' : 'hero.mp4?v=4'; // subir ?v= cada vez que cambie el video
  const VIDEO_END = 0.84;    // % del recorrido del hero que ocupa el video
  const REVEAL_LEN = 0.16;   // % del recorrido en el que aparece el panel de compra
  const PLAY_MS = 5400;      // duración de la reproducción automática con 1 scroll
  const UNIT_PRICE = null;   // precio por unidad: completar cuando esté definido (ej. 15)
  const CURRENCY = '$';
  const FREE_SHIP = 150;
  const PACKS = {
    1:  { label: 'Unidad',  units: 1,  discount: 0 },
    6:  { label: 'Pack x6', units: 6,  discount: 0.10 },
    12: { label: 'Pack x12', units: 12, discount: 0.18 },
  };

  const $ = (s) => document.querySelector(s);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const HAS_PRICE = typeof UNIT_PRICE === 'number';
  const money = (n) => (HAS_PRICE ? `${CURRENCY} ${Math.round(n).toLocaleString('es-AR')}` : '—');
  const packPrice = (k) => (HAS_PRICE ? PACKS[k].units * UNIT_PRICE * (1 - PACKS[k].discount) : 0);

  /* =========================================================
     SCROLL-SCRUBBED IMAGE SEQUENCE
     ========================================================= */
  const hero = $('#hero');
  const stage = $('.stage');
  const canvas = $('#seq');
  const ctx = canvas.getContext('2d');
  const shade = $('#shade');
  const reveal = $('.reveal');
  const hint = $('#hint');
  const loader = $('#loader');
  const loaderFill = $('#loaderFill');
  const progressFill = $('#progressFill');

  let loaded = 0;        // 0..FRAME_COUNT (progreso de descarga del video)
  let current = 0;      // frame suavizado
  let target = 0;       // frame objetivo según scroll
  let lastDrawn = -1;
  let heroP = 0;

  // ---- video fuente (oculto); se dibuja en el canvas ----
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.preload = 'auto';
  let videoReady = false;
  let shownFrame = -1;   // cuadro que el video tiene decodificado ahora
  let wantFrame = 0;     // cuadro que queremos ver
  let seeking = false, seekingFrame = -1;

  function onProgress() {
    loaderFill.style.width = `${(loaded / FRAME_COUNT) * 100}%`;
    if (loaded >= FRAME_COUNT) {
      loader.classList.add('done');
      lastDrawn = -1;
      readScroll();
    }
  }

  function doSeek() {
    if (!videoReady || seeking || !Number.isFinite(wantFrame)) return;
    const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : FRAME_COUNT / FPS;
    seeking = true;
    seekingFrame = wantFrame;
    video.currentTime = Math.min((seekingFrame + 0.5) / FPS, dur - 0.001);
  }
  video.addEventListener('seeked', () => {
    seeking = false;
    shownFrame = seekingFrame;
    paint();
    if (wantFrame !== shownFrame) doSeek();
  });
  video.addEventListener('loadeddata', () => {
    videoReady = true;
    resize();
    readScroll();
    doSeek();
  });

  // Descargamos el video completo (barra de carga real y búsqueda instantánea).
  // Si el servidor no permite fetch (CORS), lo cargamos directo.
  async function preload() {
    try {
      const res = await fetch(VIDEO_SRC);
      if (!res.ok || !res.body) throw new Error('fetch');
      const total = Number(res.headers.get('content-length')) || 0;
      const reader = res.body.getReader();
      const chunks = []; let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); got += value.length;
        if (total) { loaded = Math.min(FRAME_COUNT - 1, Math.floor((got / total) * FRAME_COUNT)); onProgress(); }
      }
      video.src = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
    } catch (_) {
      video.src = VIDEO_SRC;
    }
    loaded = FRAME_COUNT; onProgress();
  }
  /* =========================================================
     PANTALLA DE CARGA · "Recarga de poder"
     Dura al menos 3 s y no se va hasta que el video está listo
     (así el scroll nunca se traba). Avanza con la descarga real.
     ========================================================= */
  const splash = document.getElementById('splash');
  const MIN_SPLASH = 3000, MAX_SPLASH = 20000;
  const splashT0 = performance.now();
  let shown = 0, splashDone = false, splashFinished = false;
  const MSGS = [[0, 'Cargando vitaminas B'], [0.25, 'Activando taurina'], [0.5, 'Sumando inositol'], [0.75, 'Encendiendo la cafeína']];
  function splashStep() {
    if (!splash || splashDone) return;
    const el = performance.now() - splashT0;
    const ready = videoReady && hdBottle.complete;
    const real = ready ? 1 : Math.min(0.96, loaded / FRAME_COUNT);
    const goal = Math.min(real, el / MIN_SPLASH);
    shown += (goal - shown) * 0.12;
    if (goal - shown < 0.002) shown = goal;
    splash.style.setProperty('--p', shown.toFixed(4));
    document.getElementById('splashPct').textContent = Math.round(shown * 100);
    const msg = shown >= 0.995 ? '¡Poder recargado!' : MSGS.filter((m) => shown >= m[0]).pop()[1];
    const msgEl = document.getElementById('splashMsg');
    if (msgEl.textContent !== msg) msgEl.textContent = msg;
    if ((shown >= 0.995 && ready) || el > MAX_SPLASH) return finishSplash();
    setTimeout(splashStep, 16);
  }
  function finishSplash() {
    splashDone = true;
    splash.style.setProperty('--p', 1);
    document.getElementById('splashPct').textContent = 100;
    document.getElementById('splashMsg').textContent = '¡Poder recargado!';
    splash.classList.add('charged');
    setTimeout(() => {
      splash.classList.add('open');
      document.documentElement.classList.remove('is-loading');
      window.scrollTo(0, 0);
      readScroll();
      setTimeout(() => { splash.remove(); splashFinished = true; }, 1300);
    }, 650);
  }
  setTimeout(splashStep, 0); // después de que se declare todo el resto

  // iOS: un play/pause en el primer toque "despierta" el decodificador
  const wake = () => { video.play().then(() => video.pause()).catch(() => {}); window.removeEventListener('touchstart', wake); };
  window.addEventListener('touchstart', wake, { passive: true });

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(stage.clientWidth * dpr);
    canvas.height = Math.round(stage.clientHeight * dpr);
    lastDrawn = -1;
  }

  // Botella HD (recortada) registrada sobre el último frame del video.
  // Coordenadas en píxeles del video original (1280×720).
  const HD = { x: 878, y: 55.8, w: 989 * 0.392, h: 1591 * 0.392 };
  const hdBottle = new Image();
  hdBottle.decoding = 'async';
  hdBottle.onload = () => { lastDrawn = -1; };
  hdBottle.src = 'bottle-hd.webp';
  let hdAlpha = 0, lastHdAlpha = -1;

  // dibujamos la posición fraccional: frame base + el siguiente mezclado (movimiento más suave)
  function render() {
    const f = Math.round(current);
    if (f !== wantFrame) { wantFrame = f; doSeek(); }
    if (shownFrame !== lastDrawn || Math.abs(hdAlpha - lastHdAlpha) > 0.004) paint();
  }
  function paint() {
    if (shownFrame < 0) return;
    draw(shownFrame); lastDrawn = shownFrame; lastHdAlpha = hdAlpha;
  }

  // [cuadro, foco horizontal 0..1] para pantallas angostas
  // En celular el video arranca con "PUSH YOUR LIMITS" pintado en el muro
  const PAINTED = VIDEO_SRC.includes('hero-m');
  const CAM = PAINTED
    ? [[0, 0.085], [8, 0.085], [16, 0.2], [24, 0.27], [40, 0.2], [70, 0.27], [88, 0.3], [100, 0.72], [124, 0.72], [142, 0.72], [180, 0.82], [FRAME_COUNT - 1, 0.86]]
    : [[0, 0.73], [10, 0.73], [20, 0.27], [40, 0.2], [70, 0.27], [88, 0.3], [100, 0.72], [124, 0.72], [142, 0.72], [180, 0.82], [FRAME_COUNT - 1, 0.86]];
  // celular: al scrollear el muro pintado se agranda (acercamiento) antes del golpe
  const ZOOM = PAINTED ? [[0, 1], [10, 1.35], [18, 1.12], [26, 1]] : [[0, 1], [1, 1]];
  // cuánto se aleja la cámara del celular para que entre "PUSH YOUR LIMITS" completo (1 = titular entero)
  const WIDE = PAINTED
    ? [[0, 0], [88, 0], [100, 1], [126, 1], [146, 0], [FRAME_COUNT - 1, 0]]
    : [[0, 1], [10, 1], [22, 0], [88, 0], [100, 1], [126, 1], [146, 0], [FRAME_COUNT - 1, 0]];
  function kf(arr, i) {
    for (let n = 1; n < arr.length; n++) {
      if (i <= arr[n][0]) {
        const [a, fa] = arr[n - 1], [b, fb] = arr[n];
        const t = clamp((i - a) / (b - a)); const e = t * t * (3 - 2 * t);
        return fa + (fb - fa) * e;
      }
    }
    return arr[arr.length - 1][1];
  }
  function camFollow(i) {
    for (let n = 1; n < CAM.length; n++) {
      if (i <= CAM[n][0]) {
        const [a, fa] = CAM[n - 1], [b, fb] = CAM[n];
        const t = clamp((i - a) / (b - a)); const e = t * t * (3 - 2 * t);
        return fa + (fb - fa) * e;
      }
    }
    return CAM[CAM.length - 1][1];
  }

  function draw(i) {
    const img = video;
    if (!img.videoWidth) return;
    const cw = canvas.width, ch = canvas.height;
    const iw = img.videoWidth, ih = img.videoHeight;
    const cover = Math.max(cw / iw, ch / ih);
    const vis0 = cw / (iw * cover);
    const k0 = clamp((vis0 - 0.3) / 0.45);
    // celular: al inicio se aleja un poco para que entre el titular completo,
    // y se acerca a la acción cuando el puño rompe el muro
    const zFit = Math.min(1, vis0 / 0.46);
    const wide = kf(WIDE, i);
    const zMob = zFit + (1 - zFit) * (1 - wide);
    const zoomIn = 1 + (kf(ZOOM, i) - 1) * (1 - k0);
    const scale = cover * (1 - (1 - zMob) * (1 - k0)) * zoomIn;
    const dw = iw * scale, dh = ih * scale;
    // en pantallas angostas seguimos la acción: texto/hombre → botella
    // intro: arranca sobre el muro (izquierda); después sigue al hombre, el texto y la botella
    // cuanto menos ancho se ve (celular), más se acerca al muro; en escritorio queda centrado
    const k = k0;                                          // 0 = celular · 1 = pantalla ancha
    // pantalla ancha: encuadre casi fijo
    const desk = i < INTRO_FRAMES
      ? 0.5 + 0.05 * (i / INTRO_FRAMES)
      : 0.55 + 0.3 * Math.pow((i - INTRO_FRAMES) / (FRAME_COUNT - 1 - INTRO_FRAMES), 1.5);
    // celular: la cámara sigue la acción (titular → puño → salto → empuje → botella)
    let focusX = desk * k + camFollow(i) * (1 - k);
    // al inicio, que el titular entre completo (borde derecho del texto ≈ 95% del cuadro)
    const need = 0.955 - (cw / dw) / 2;
    focusX += (Math.max(focusX, need) - focusX) * wide;
    const dx = Math.min(0, Math.max(cw - dw, cw / 2 - dw * focusX));
    const dy = (ch - dh) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#f6d502';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
    if (dy > 0.5) { // bandas arriba/abajo: se estira el borde del video (fondo amarillo liso)
      ctx.drawImage(img, 0, 0, iw, 2, dx, 0, dw, dy + 1);
      ctx.drawImage(img, 0, ih - 2, iw, 2, dx, dy + dh - 1, dw, ch - dy - dh + 1);
    }
    if (i === FRAME_COUNT - 1 && hdAlpha > 0 && hdBottle.complete && hdBottle.naturalWidth) {
      const k = dw / 1280;
      ctx.globalAlpha = hdAlpha;
      ctx.drawImage(hdBottle, dx + HD.x * k, dy + HD.y * k, HD.w * k, HD.h * k);
      ctx.globalAlpha = 1;
    }
  }

  function readScroll() {
    const rect = hero.getBoundingClientRect();
    const total = Math.max(1, hero.offsetHeight - window.innerHeight);
    heroP = clamp(-rect.top / total) || 0;
    target = clamp(heroP / VIDEO_END) * (FRAME_COUNT - 1);

    const r = clamp((heroP - VIDEO_END) / REVEAL_LEN);
    const eased = r * r * (3 - 2 * r);
    hdAlpha = clamp(r * 1.6);
    stage.style.setProperty('--r', eased.toFixed(4));
    shade.style.opacity = (eased * 0.92).toFixed(3);
    reveal.classList.toggle('active', r > 0.6);
    progressFill.style.height = `${heroP * 100}%`;
    hint.classList.toggle('show', heroP < 0.015 && loaded > 20);
    if (heroP > 0.02) loader.classList.add('done');
    // si rAF está pausado (pestaña en segundo plano), dibujamos directo
    if (performance.now() - lastTick > 120) {
      current = target;
      render();
    }
  }

  let lastTick = 0;
  function tick(now) {
    lastTick = now || performance.now();
    current = playing ? target : current + (target - current) * 0.16;
    if (Math.abs(target - current) < 0.01) current = target;
    render();
    requestAnimationFrame(tick);
  }

  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', () => { resize(); readScroll(); });
  preload();
  readScroll();
  current = target;
  requestAnimationFrame(tick);

  /* =========================================================
     UN SOLO SCROLL: el primer gesto reproduce todo el video
     hasta el panel de compra; scrollear hacia arriba lo rebobina.
     ========================================================= */
  let playing = false;
  let lockUntil = 0;
  const heroEnd = () => hero.offsetTop + hero.offsetHeight - window.innerHeight;
  const ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2; // easeInOutSine: arranque y frenado suaves

  // rAF con respaldo por timer (si el navegador pausa rAF, la animación igual termina)
  function nextFrame(fn) {
    let done = false;
    requestAnimationFrame((t) => { if (!done) { done = true; fn(t); } });
    setTimeout(() => { if (!done) { done = true; fn(performance.now()); } }, 60);
  }

  function playTo(y, dur) {
    playing = true;
    const y0 = window.scrollY;
    const t0 = performance.now();
    const step = (now) => {
      const t = clamp((now - t0) / dur);
      window.scrollTo(0, y0 + (y - y0) * ease(t));
      readScroll();
      if (t < 1) nextFrame(step);
      else { playing = false; lockUntil = performance.now() + 450; }
    };
    nextFrame(step);
  }

  // dir: 1 abajo, -1 arriba. Devuelve true si el gesto lo manejamos nosotros.
  function intent(dir) {
    const now = performance.now();
    if (document.documentElement.classList.contains('is-loading')) return true; // cargando: no scrollear
    if (playing || now < lockUntil) { lockUntil = Math.max(lockUntil, now + 180); return true; }
    const y = window.scrollY, end = heroEnd();
    if (dir > 0 && y < end - 2) {
      playTo(end, Math.max(500, PLAY_MS * (1 - y / end)));
      return true;
    }
    if (dir < 0 && y > 2 && y <= end + 2) {
      playTo(0, Math.max(500, PLAY_MS * 0.7 * (y / end)));
      return true;
    }
    return false;
  }

  window.addEventListener('wheel', (e) => {
    if (document.body.classList.contains('cart-open') || document.body.classList.contains('modal-open') || Math.abs(e.deltaY) < 1) return;
    if (intent(Math.sign(e.deltaY))) e.preventDefault();
  }, { passive: false });

  let touchY = null;
  window.addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (touchY === null || document.body.classList.contains('cart-open') || document.body.classList.contains('modal-open')) return;
    const dy = touchY - e.touches[0].clientY;
    if (playing || performance.now() < lockUntil) { e.preventDefault(); return; }
    if (Math.abs(dy) > 10 && intent(Math.sign(dy))) { e.preventDefault(); touchY = null; }
  }, { passive: false });
  window.addEventListener('touchend', () => { touchY = null; }, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, button') || document.body.classList.contains('modal-open')) return;
    const down = ['ArrowDown', 'PageDown', ' '].includes(e.key);
    const up = ['ArrowUp', 'PageUp'].includes(e.key);
    if ((down || up) && intent(down ? 1 : -1)) e.preventDefault();
  });

  // links a "#comprar" → final del hero (donde aparece el producto)
  function goToBuy(e) {
    e.preventDefault();
    closeCart();
    const end = heroEnd();
    playTo(end, window.scrollY < end ? PLAY_MS * (1 - window.scrollY / end) : 900);
  }
  document.querySelectorAll('a[href="#comprar"]').forEach((a) => a.addEventListener('click', goToBuy));

  /* =========================================================
     BENEFITS: aparición al entrar en pantalla
     ========================================================= */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.25 });
  document.querySelectorAll('.benefit').forEach((el) => io.observe(el));

  /* =========================================================
     BUY BOX
     ========================================================= */
  let qty = 1;
  const qtyOut = $('#qty');
  const priceEl = $('#price');
  const priceUnit = $('#priceUnit');
  const selectedPack = () => document.querySelector('input[name="pack"]:checked').value;

  function renderPrice() {
    const k = selectedPack();
    priceEl.textContent = HAS_PRICE ? money(packPrice(k)) : 'Precio';
    if (!HAS_PRICE) { priceUnit.textContent = `${PACKS[k].label} · a definir`; return; }
    priceUnit.textContent = PACKS[k].units === 1
      ? 'por unidad'
      : `${PACKS[k].label} · ${money(packPrice(k) / PACKS[k].units)} c/u`;
  }
  document.querySelectorAll('input[name="pack"]').forEach((r) => r.addEventListener('change', renderPrice));
  $('#qtyMinus').addEventListener('click', () => { qty = Math.max(1, qty - 1); qtyOut.textContent = qty; });
  $('#qtyPlus').addEventListener('click', () => { qty = Math.min(99, qty + 1); qtyOut.textContent = qty; });
  renderPrice();

  /* =========================================================
     CART
     ========================================================= */
  const STORE_KEY = 'reaktor-cart';
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (_) { cart = {}; }
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(cart)); } catch (_) {} };

  const drawer = $('#drawer');
  const list = $('#cartItems');

  function renderCart() {
    const keys = Object.keys(cart).filter((k) => cart[k] > 0 && PACKS[k]);
    let subtotal = 0, units = 0;
    list.innerHTML = keys.map((k) => {
      const line = packPrice(k) * cart[k];
      subtotal += line; units += cart[k];
      return `
        <li class="cart-item">
          <div class="thumb"><img src="bottle.webp" alt=""></div>
          <div>
            <h4>Reaktor 350 ml</h4>
            <p>${PACKS[k].label} · ${money(packPrice(k))}</p>
            <div class="mini-qty">
              <button data-act="dec" data-k="${k}" aria-label="Restar">−</button>
              <span>${cart[k]}</span>
              <button data-act="inc" data-k="${k}" aria-label="Sumar">+</button>
            </div>
          </div>
          <div>
            <div class="line-total">${money(line)}</div>
            <button class="remove" data-act="del" data-k="${k}">Quitar</button>
          </div>
        </li>`;
    }).join('');
    drawer.classList.toggle('empty', keys.length === 0);
    $('#cartCount').textContent = units;
    $('#subtotal').textContent = money(subtotal);
    document.querySelector('.ship-meter').hidden = !HAS_PRICE;
    $('#shipMsg').hidden = !HAS_PRICE;
    const missing = FREE_SHIP - subtotal;
    $('#shipFill').style.width = `${clamp(subtotal / FREE_SHIP) * 100}%`;
    $('#shipMsg').textContent = missing > 0
      ? `Te faltan ${money(missing)} para el envío gratis.`
      : '¡Tenés envío gratis! 🚚';
    $('#checkout').disabled = keys.length === 0;
    save();
  }

  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const k = b.dataset.k;
    if (b.dataset.act === 'inc') cart[k] = (cart[k] || 0) + 1;
    if (b.dataset.act === 'dec') cart[k] = Math.max(0, (cart[k] || 0) - 1);
    if (b.dataset.act === 'del') cart[k] = 0;
    if (!cart[k]) delete cart[k];
    renderCart();
  });

  const toastEl = $('#toast');
  let toastT;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  $('#addBtn').addEventListener('click', () => {
    const k = selectedPack();
    cart[k] = (cart[k] || 0) + qty;
    renderCart();
    const btn = $('#cartOpen');
    btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump');
    toast(`Agregaste ${qty} × ${PACKS[k].label} al carrito`);
    qty = 1; qtyOut.textContent = qty;
    setTimeout(openCart, 450);
  });

  function openCart() { document.body.classList.add('cart-open'); drawer.setAttribute('aria-hidden', 'false'); }
  function closeCart() { document.body.classList.remove('cart-open'); drawer.setAttribute('aria-hidden', 'true'); }
  $('#cartOpen').addEventListener('click', openCart);
  $('#cartClose').addEventListener('click', closeCart);
  $('#backdrop').addEventListener('click', closeCart);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCart(); });
  $('#checkout').addEventListener('click', () => toast('Checkout de demostración: conectá aquí tu pasarela de pago.'));

  /* =========================================================
     SNAP SUAVE: al dejar de scrollear, la página se acomoda en la
     sección más cercana (nunca queda mitad y mitad). El hero no se toca.
     ========================================================= */
  const snapSections = () => [...document.querySelectorAll('.split, .formula-sec, .history, .where, .biz, .faq')];
  let snapT;
  // Snap por dirección: un scroll corto hacia abajo lleva a la sección siguiente,
  // uno hacia arriba a la anterior (no hace falta "empujar" media pantalla).
  let settledY = window.scrollY, snapUntil = 0;
  function softSnap() {
    // mientras se está deslizando hacia una sección, no re-evaluar (evita idas y vueltas)
    if (performance.now() < snapUntil && Math.abs(window.scrollY - settledY) > 3) return;
    if (playing || document.body.classList.contains('cart-open') || document.body.classList.contains('modal-open')) return;
    const y = window.scrollY, vh = window.innerHeight, end = heroEnd();
    if (y < end + 2) { settledY = y; return; } // zona del hero: la maneja la reproducción
    const maxY = document.documentElement.scrollHeight - vh;
    // si una sección alta cubre toda la pantalla, el usuario está leyendo: no mover
    for (const el of snapSections()) {
      const top = el.offsetTop, bottom = top + el.offsetHeight;
      if (top <= y + 1 && bottom >= y + vh - 1) { settledY = y; return; }
    }
    const targets = [end, ...snapSections().map((el) => el.offsetTop), maxY].sort((p, q) => p - q);
    // si ya está justo al inicio de una sección (ej. llegó por un link del menú), queda ahí
    if (targets.some((t) => Math.abs(t - y) <= 3)) { settledY = y; return; }
    const moved = y - settledY;
    let goal = null;
    if (Math.abs(moved) > Math.min(70, vh * 0.08)) {
      // siguiente sección en la dirección del gesto
      goal = moved > 0 ? targets.find((t) => t > y + 2) : [...targets].reverse().find((t) => t < y - 2);
      if (goal === undefined) goal = null;
    }
    if (goal === null) { // gesto mínimo: volver a la más cercana
      goal = targets.reduce((b, t) => (Math.abs(t - y) < Math.abs(b - y) ? t : b), targets[0]);
    }
    settledY = goal;
    if (Math.abs(goal - y) > 2) {
      snapUntil = performance.now() + 1400;
      window.scrollTo({ top: goal, behavior: 'smooth' });
    }
  }
  window.addEventListener('scroll', () => {
    clearTimeout(snapT);
    snapT = setTimeout(softSnap, 140);
  }, { passive: true });

  /* =========================================================
     LINKS INTERNOS (scroll suave a secciones fuera del hero)
     ========================================================= */
  document.querySelectorAll('a[href^="#"]:not([href="#comprar"]):not([href="#"])').forEach((a) => {
    a.addEventListener('click', (e) => {
      const el = document.querySelector(a.getAttribute('href'));
      if (!el) return;
      e.preventDefault();
      closeCart();
      if (a.dataset.faqTab) selectFaq(a.dataset.faqTab);
      const goal = el.offsetTop;
      settledY = goal; snapUntil = performance.now() + 1600; // que el snap no lo interrumpa
      window.scrollTo({ top: goal, behavior: 'smooth' });
    });
  });

  /* =========================================================
     DÓNDE COMPRAR
     Cargar acá los comercios adheridos (opt-in). Los "demo" son
     solo para mostrar la estructura: borrarlos al cargar datos reales.
     ========================================================= */
  // city = provincia · zone = localidad · lat/lng = coordenadas del local (para el mapa)
  // Los "demo" muestran la estructura: reemplazarlos por los comercios reales.
  const STORES = [
    { name: 'Nombre del comercio', city: 'Salta', zone: 'Localidad', address: 'Dirección del local', lat: -24.7883, lng: -65.4106, demo: true },
    { name: 'Nombre del comercio', city: 'Tucumán', zone: 'Localidad', address: 'Dirección del local', lat: -26.8241, lng: -65.2226, demo: true },
    { name: 'Nombre del comercio', city: 'Jujuy', zone: 'Localidad', address: 'Dirección del local', lat: -24.1858, lng: -65.2995, demo: true },
  ];
  // centro de cada provincia (capital) para acercar el mapa al filtrar
  const PROV = {
    'Jujuy': [-24.19, -65.30], 'Salta': [-24.79, -65.41], 'Tucumán': [-26.81, -65.22],
    'Catamarca': [-28.47, -65.78], 'La Rioja': [-29.41, -66.86], 'Santiago del Estero': [-27.80, -64.26],
    'Formosa': [-26.18, -58.18], 'Chaco': [-27.45, -58.99], 'Corrientes': [-27.47, -58.83], 'Misiones': [-27.37, -55.90],
  };
  const cityFilter = $('#cityFilter');
  const storeSearch = $('#storeSearch');
  const storeList = $('#storeList');
  const storeEmpty = $('#storeEmpty');
  const mapEl = $('#storeMap');
  const norm = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let map = null, markerLayer = null, visible = [];

  function filtered() {
    const city = cityFilter.value;
    const q = norm(storeSearch.value.trim());
    return STORES.filter((st) => (!city || st.city === city) &&
      (!q || norm(`${st.name} ${st.zone} ${st.address} ${st.city}`).includes(q)));
  }
  function renderStores() {
    visible = filtered();
    storeList.innerHTML = visible.map((st, n) => `
      <li class="store" data-i="${n}" tabindex="0">
        <div>
          <b>${esc(st.name)}</b>${st.demo ? '<span class="demo-tag">Ejemplo</span>' : ''}
          <p>${esc(st.address)} · ${esc(st.zone)}</p>
        </div>
        <span class="store-city">${esc(st.city)}</span>
      </li>`).join('');
    storeEmpty.hidden = visible.length > 0;
    renderMap();
  }
  function renderMap() {
    if (!map || !window.L) return;
    markerLayer.clearLayers();
    const pts = [];
    visible.forEach((st, n) => {
      if (typeof st.lat !== 'number') return;
      const m = L.marker([st.lat, st.lng], { icon: L.divIcon({ className: 'pin', html: '<i></i>', iconSize: [22, 22], iconAnchor: [11, 11] }) })
        .bindPopup(`<b>${esc(st.name)}</b><br>${esc(st.address)} · ${esc(st.zone)}`);
      m.on('click', () => highlight(n));
      markerLayer.addLayer(m); st._m = m; pts.push([st.lat, st.lng]);
    });
    const city = cityFilter.value;
    if (pts.length) map.flyToBounds(L.latLngBounds(pts).pad(0.4), { maxZoom: city ? 12 : 6, duration: 0.8 });
    else if (city && PROV[city]) map.flyTo(PROV[city], 9, { duration: 0.8 });
    else map.flyTo([-26.5, -62], 5, { duration: 0.8 });
  }
  function highlight(n) {
    storeList.querySelectorAll('.store').forEach((li) => li.classList.toggle('on', Number(li.dataset.i) === n));
  }
  storeList.addEventListener('click', (e) => {
    const li = e.target.closest('.store'); if (!li) return;
    const st = visible[Number(li.dataset.i)];
    highlight(Number(li.dataset.i));
    if (map && st && st._m) { map.flyTo([st.lat, st.lng], 14, { duration: 0.8 }); st._m.openPopup(); }
  });
  cityFilter.addEventListener('change', renderStores);
  storeSearch.addEventListener('input', renderStores);
  renderStores();

  // Leaflet + OpenStreetMap: se carga recién al acercarse a "Dónde comprar"
  function loadMap() {
    if (map || !mapEl) return;
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    js.onload = () => {
      map = L.map(mapEl, { scrollWheelZoom: false, zoomControl: true, attributionControl: true }).setView([-26.5, -62], 5);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      markerLayer = L.layerGroup().addTo(map);
      renderMap();
    };
    js.onerror = () => { mapEl.hidden = true; };
    document.head.appendChild(js);
  }
  const mapIO = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) { loadMap(); mapIO.disconnect(); } }, { rootMargin: '600px 0px' });
  if (mapEl) mapIO.observe(mapEl);

  /* =========================================================
     FAQ CON PESTAÑAS
     ========================================================= */
  const tabs = { consumer: $('#tabConsumer'), business: $('#tabBusiness') };
  const panels = { consumer: $('#faqConsumer'), business: $('#faqBusiness') };
  function selectFaq(key) {
    Object.keys(tabs).forEach((k) => {
      const on = k === key;
      tabs[k].setAttribute('aria-selected', on);
      tabs[k].tabIndex = on ? 0 : -1;
      panels[k].hidden = !on;
    });
    $('#faq').dataset.audience = key;
    if (typeof setAudience === 'function' && waFloat) setAudience(key);
  }
  tabs.consumer.addEventListener('click', () => selectFaq('consumer'));
  tabs.business.addEventListener('click', () => selectFaq('business'));
  document.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = tabs.consumer.getAttribute('aria-selected') === 'true' ? 'business' : 'consumer';
    selectFaq(next); tabs[next].focus();
  });

  /* =========================================================
     WHATSAPP: mensaje distinto según la sección que estás viendo
     ========================================================= */
  const WA_NUMBER = '549XXXXXXXXXX'; // completar: 54 9 + código de área sin 0 + número sin 15 (ej. 5493871234567)
  const WA_MSG = {
    consumer: { text: 'Hola Reaktor, quiero hacer una consulta sobre el producto.' },
    business: { text: 'Hola Reaktor, tengo un comercio en el norte argentino y quiero ser distribuidor. Provincia: , Localidad: , Tipo de negocio: ' },
  };
  const waFloat = $('#waFloat');
  const waBubble = $('#waBubble');
  const waUrl = (k) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(WA_MSG[k].text)}`;
  function setAudience(k) {
    waFloat.href = waUrl(k);
    waFloat.dataset.audience = k;
  }
  setAudience('consumer');
  document.querySelectorAll('.wa-link').forEach((a) => {
    a.href = waUrl(a.dataset.wa || 'consumer');
    a.target = '_blank'; a.rel = 'noopener';
  });
  const audIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) setAudience(en.target.dataset.audience); });
  }, { rootMargin: '-45% 0px -45% 0px' });
  document.querySelectorAll('section[data-audience]').forEach((el) => audIO.observe(el));
  // aparece cuando el visitante ya pasó el hero (no tapa la escena del video)
  const waToggle = () => {
    // aparece recién al dejar atrás el hero (no tapa el panel de compra)
    const on = window.scrollY > heroEnd() + window.innerHeight * 0.5;
    waFloat.classList.toggle('show', on);
    waBubble.classList.toggle('show', on && !bubbleGone);
    // en celular el globito se muestra unos segundos y queda solo el logo
    if (on && !bubbleTimer && window.matchMedia('(max-width: 820px)').matches) {
      bubbleTimer = setTimeout(() => { bubbleGone = true; waBubble.classList.remove('show'); }, 5000);
    }
  };
  let bubbleGone = false, bubbleTimer = 0;
  window.addEventListener('scroll', waToggle, { passive: true });
  waToggle();

  /* =========================================================
     VENTANAS: "Conocé Reaktor" y "Otros países de Latinoamérica"
     ========================================================= */
  let lastFocus = null;
  function openModal(id) {
    const m = document.getElementById(id); if (!m) return;
    closeCart();
    lastFocus = document.activeElement;
    m.hidden = false;
    requestAnimationFrame(() => m.classList.add('open'));
    document.body.classList.add('modal-open');
    const f = m.querySelector('.modal-close'); if (f) f.focus({ preventScroll: true });
  }
  function closeModal(m) {
    if (!m || m.hidden) return;
    m.classList.remove('open');
    document.body.classList.remove('modal-open');
    setTimeout(() => { m.hidden = true; }, 300);
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }
  document.querySelectorAll('.story-open').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openModal('storyModal'); }));
  document.querySelectorAll('.latam-open').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openModal('latamModal'); }));
  document.querySelectorAll('.modal').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(m); });
    m.querySelectorAll('[data-close-go]').forEach((a) => a.addEventListener('click', () => closeModal(m)));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach(closeModal);
  });

  // Otros países: arma el mensaje y lo abre en WhatsApp (llega al equipo, que lo deriva)
  const latamForm = $('#latamForm');
  latamForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!latamForm.reportValidity()) return;
    const d = new FormData(latamForm);
    const wa = d.get('whatsapp') ? ` Mi WhatsApp: ${dialOf(latamForm)} ${d.get('whatsapp')}.` : '';
    const txt = `Hola Reaktor, les escribo desde ${d.get('pais')} (${d.get('zona')}). Soy ${d.get('nombre')}.${wa} ${d.get('mensaje')}`;
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
    latamForm.reset();
    closeModal($('#latamModal'));
    toast('¡Gracias! Te respondemos a la brevedad.');
  });

  /* =========================================================
     QUIERO SER DISTRIBUIDOR: "Soy de Argentina" / "Soy de otro país"
     Al elegir, se abre el formulario; al enviar, llega por WhatsApp.
     ========================================================= */
  const joinTabs = { ar: $('#joinTabAr'), lat: $('#joinTabLat') };
  const joinForms = { ar: $('#joinAr'), lat: $('#joinLat') };
  const joinPanels = { ar: $('#panelAr'), lat: $('#panelLat') };
  function selectJoin(k) {
    Object.keys(joinTabs).forEach((key) => {
      const on = key === k;
      joinTabs[key].setAttribute('aria-selected', on);
      joinPanels[key].hidden = !on;
    });
    settledY = window.scrollY; // que el snap no mueva la página al desplegar
  }

  // Países de Latinoamérica con su código telefónico (se completa solo al elegir)
  const LATAM = [
    ['Bolivia', '+591'], ['Brasil', '+55'], ['Chile', '+56'], ['Colombia', '+57'], ['Costa Rica', '+506'],
    ['Cuba', '+53'], ['Ecuador', '+593'], ['El Salvador', '+503'], ['Guatemala', '+502'], ['Haití', '+509'],
    ['Honduras', '+504'], ['México', '+52'], ['Nicaragua', '+505'], ['Panamá', '+507'], ['Paraguay', '+595'],
    ['Perú', '+51'], ['Puerto Rico', '+1'], ['República Dominicana', '+1'], ['Uruguay', '+598'], ['Venezuela', '+58'],
  ];
  document.querySelectorAll('select[data-latam]').forEach((sel) => {
    sel.innerHTML = '<option value="">Elegí tu país</option>' +
      LATAM.map(([n, c]) => `<option value="${n}" data-dial="${c}">${n} (${c})</option>`).join('');
    const dial = sel.closest('form').querySelector('[data-prefix]');
    sel.addEventListener('change', () => {
      const o = sel.selectedOptions[0];
      if (dial) dial.textContent = (o && o.dataset.dial) || '+ ···';
    });
  });
  const dialOf = (form) => { const o = form.querySelector('select[data-latam]').selectedOptions[0]; return (o && o.dataset.dial) || ''; };
  joinTabs.ar.addEventListener('click', () => selectJoin('ar'));
  joinTabs.lat.addEventListener('click', () => selectJoin('lat'));

  function sendJoin(form, lines) {
    if (!form.reportValidity()) return;
    const txt = lines.filter(Boolean).join(String.fromCharCode(10));
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
    form.reset();
    toast('¡Gracias! Te contactamos a la brevedad.');
  }
  joinForms.ar.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = new FormData(joinForms.ar);
    sendJoin(joinForms.ar, [
      'Hola Reaktor, quiero ser distribuidor (Argentina).',
      `Tipo: ${d.get('tipo')}`,
      `Nombre: ${d.get('nombre')}`,
      d.get('negocio') && `Negocio: ${d.get('negocio')}`,
      `Provincia: ${d.get('provincia')} · Localidad: ${d.get('localidad')}`,
      d.get('rubro') && `Rubro: ${d.get('rubro')}`,
      `WhatsApp: +54 9 ${d.get('whatsapp')}`,
    ]);
  });
  joinForms.lat.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = new FormData(joinForms.lat);
    sendJoin(joinForms.lat, [
      `Hola Reaktor, quiero ser distribuidor en ${d.get('pais')}.`,
      `Ciudad: ${d.get('ciudad')}`,
      `Nombre: ${d.get('nombre')}`,
      d.get('negocio') && `Negocio: ${d.get('negocio')}`,
      `WhatsApp: ${dialOf(joinForms.lat)} ${d.get('whatsapp')}`,
      d.get('email') && `Email: ${d.get('email')}`,
      d.get('mensaje') && `Mensaje: ${d.get('mensaje')}`,
    ]);
  });

  /* =========================================================
     LÍNEA DE TIEMPO: se "carga" de energía al scrollear
     ========================================================= */
  const timeline = $('#timeline');
  if (timeline) {
    const fill = timeline.querySelector('.tl-fill');
    const items = [...timeline.querySelectorAll('.tl-item')];
    const tlUpdate = () => {
      const r = timeline.getBoundingClientRect();
      const mid = window.innerHeight * 0.8;
      const p = clamp((mid - r.top) / r.height);
      fill.style.height = `${p * 100}%`;
      items.forEach((it) => {
        const ir = it.getBoundingClientRect();
        it.classList.toggle('on', ir.top + 30 < mid);
      });
    };
    window.addEventListener('scroll', tlUpdate, { passive: true });
    window.addEventListener('resize', tlUpdate);
    tlUpdate();
  }

  renderCart();
})();
