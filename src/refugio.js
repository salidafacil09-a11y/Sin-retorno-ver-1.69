(function (G) {
  'use strict';

  // Refugio del modo Retorno (diseño propio, inspirado en el escondite de los modos sin retorno):
  //   - mesa del mapa con el corcho: eliges el siguiente enfrentamiento (5 y el jefe final, «próximamente»)
  //   - cofre de recompensas: lo que ganaste en el último enfrentamiento
  //   - puesto de comercio: se compra con monedas (lo que hay a la venta cambia tras cada enfrentamiento)
  //   - banco de mejoras: se mejora el arma con piezas; vista desde arriba del arma en el tapete y las manos
  //     trabajando en ella
  //   - mesa de fabricación: abre la mochila
  // En el refugio se puede apuntar pero no disparar ni golpear.
  // También aquí: G.Props (objetos con los que se interactúa con ∆ / T: las estaciones del refugio y el maletín
  // de suministros que aparece tras las oleadas del asalto).

  const U = G.Util;
  const el = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;

  // ================= Objetos con los que se interactúa =================
  const Props = {
    list: [],
    add(p) { p.lv = p.lv || 0; this.list.push(p); return p; },
    remove(p) {
      const i = this.list.indexOf(p);
      if (i >= 0) this.list.splice(i, 1);
      if (p.dispose) p.dispose();
    },
    clear() { while (this.list.length) this.remove(this.list[this.list.length - 1]); }
  };
  G.Props = Props;

  let scene = null, player = null, camera = null, onMsg = null;
  let root = null, hud = null, marks = null;
  let panel = null;           // 'mapa' | 'tienda' | 'banco' | null
  let crateOpen = false, inside = false, packWas = false;
  const msg = (m, k) => { if (onMsg) onMsg(m, k); };
  const ICONS = {
    coin: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 5.5 V14.5 M7.6 7.6 Q10 6 12.2 7.4 Q8 10 12.4 12.4 Q10 14 7.6 12.4"/></svg>',
    gear: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 L11.3 4.6 L13.7 4 L14.2 6.4 L16.5 7.2 L15.6 9.5 L17 11.5 L15 12.9 L15.2 15.3 L12.8 15.4 L11.6 17.5 L10 16 L8.4 17.5 L7.2 15.4 L4.8 15.3 L5 12.9 L3 11.5 L4.4 9.5 L3.5 7.2 L5.8 6.4 L6.3 4 L8.7 4.6 Z"/><circle cx="10" cy="10" r="2.6"/></svg>',
    x: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5"/><path d="M6.8 6.8 L13.2 13.2 M13.2 6.8 L6.8 13.2"/></svg>',
    o: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5"/><circle cx="10" cy="10" r="4"/></svg>',
    asalto: '<path d="M-9 -6 L0 -1 L9 -6 M-9 0 L0 5 L9 0 M-9 6 L0 11 L9 6" />',
    caza: '<path d="M-7 -9 L7 -9 L0 0 L7 9 L-7 9 L0 0 Z" />',
    boss: '<path d="M-9 4 Q-9 -10 0 -10 Q9 -10 9 4 L6 4 L6 9 L-6 9 L-6 4 Z M-4 -2 A2.4 2.4 0 1 0 -4 -1.9 M4 -2 A2.4 2.4 0 1 0 4 -1.9" />',
    home: '<path d="M-9 1 L0 -8 L9 1 M-6 -1 L-6 8 L6 8 L6 -1" />',
    check: '<path d="M-6 0 L-2 5 L7 -5" />'
  };

  // ================= Maletín de suministros (asalto) =================
  let caseGeo = null, caseMat = null, glintTex = null;
  function glintTexture() {
    if (glintTex) return glintTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.25, 'rgba(255,220,150,0.5)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    glintTex = new THREE.CanvasTexture(c);
    return glintTex;
  }
  function caseGeometry() {
    if (caseGeo) return caseGeo;
    // maletín de aluminio abollado con esquinas negras, asa y dos cierres; la tapa algo abierta con una
    // cinta roja (para verlo de lejos)
    const m = new G.Mesher();
    m.box(0, 0.09, 0, 0.62, 0.17, 0.42, 0x9aa1a6);
    m.box(0, 0.175, 0, 0.64, 0.02, 0.44, 0x2a2c2e);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(sx * 0.29, 0.09, sz * 0.19, 0.06, 0.19, 0.06, 0x232527);
    m.box(0, 0.12, 0.215, 0.18, 0.03, 0.02, 0x2a2c2e);
    for (const sx of [-1, 1]) m.box(sx * 0.17, 0.15, 0.215, 0.05, 0.04, 0.02, 0xb8bcc0);
    m.box(0, 0.22, -0.02, 0.62, 0.012, 0.42, 0x8d9499, 0, undefined, -0.18);
    m.box(0, 0.095, 0.212, 0.62, 0.035, 0.006, 0xc0392b);
    m.box(0.33, 0.1, 0, 0.006, 0.03, 0.42, 0xc0392b);
    caseGeo = m.build();
    return caseGeo;
  }
  function spawnCase(x, z, items, name) {
    if (!caseMat) caseMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(caseGeometry(), caseMat);
    mesh.castShadow = true;
    g.add(mesh);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
    s.material.toneMapped = false; s.scale.setScalar(0.7); s.position.y = 0.32;
    g.add(s);
    const y = G.World.groundY(x, z, 0);
    g.position.set(x, y, z);
    g.rotation.y = Math.random() * TAU;
    scene.add(g);
    const mark = document.createElement('div');
    mark.className = 'rf-mark case';
    mark.innerHTML = '<i></i><b>Suministros</b><span></span>';
    marks.appendChild(mark);
    const f = { cont: { name: name || 'Maletín de suministros', items, kind: 'maletin', searched: true }, x0: x - 0.3, x1: x + 0.3, z0: z - 0.2, z1: z + 0.2 };
    const p = Props.add({
      x, z, y, label: 'Abrir el maletín de suministros', reach: 1.6, kind: 'case', f, mesh: g, glint: s, mark, t: Math.random() * 6,
      use(pl) {
        if (!f.cont.items.length) return 'Está vacío';
        G.Loot.open({ f }, pl);
        return null;
      },
      dispose() { if (g.parent) g.parent.remove(g); s.material.dispose(); mark.remove(); }
    });
    if (G.Audio) G.Audio.play('pickup');
    return p;
  }

  // ================= Estaciones del refugio =================
  const ST_NAME = { mapa: 'Mapa', cofre: 'Recompensas', tienda: 'Comercio', banco: 'Mejoras', fabricar: 'Fabricar' };
  function buildStations() {
    for (const s of G.World.stations) {
      const mark = document.createElement('div');
      mark.className = 'rf-mark st';
      mark.innerHTML = '<i></i><b>' + ST_NAME[s.id] + '</b>';
      marks.appendChild(mark);
      let glint = null;
      if (s.id === 'cofre') {
        glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
        glint.material.toneMapped = false; glint.scale.setScalar(0.45);
        glint.position.set(s.cx, s.top + 0.25, s.cz);
        scene.add(glint);
      }
      Props.add({
        x: s.cx, z: s.cz, y: s.top, fx: s.x, fz: s.z, label: s.label, reach: 1.9, kind: 'station', id: s.id, mark, glint, t: 0,
        use(pl) { return useStation(s.id, pl); },
        dispose() { mark.remove(); if (glint) { if (glint.parent) glint.parent.remove(glint); glint.material.dispose(); } }
      });
    }
  }
  function useStation(id, pl) {
    if (id === 'cofre') {
      const items = G.Run.crate;
      if (!items.length) return 'El cofre de recompensas está vacío: se llena al volver de cada enfrentamiento';
      G.Loot.open({ f: { cont: { name: 'Cofre de recompensas', items, kind: 'cofre', searched: true } } }, pl);
      crateOpen = true;
      return null;
    }
    if (id === 'fabricar') { G.Backpack.open(pl); return null; }
    open(id);
    return null;
  }

  // ================= Marcadores en pantalla =================
  const _v = new THREE.Vector3();
  function placeMark(p, show, dist, edge) {
    const m = p.mark;
    if (!m) return;
    if (!show) { if (!m.classList.contains('hidden')) m.classList.add('hidden'); return; }
    _v.set(p.x, (p.y || 0) + (p.kind === 'station' ? 0.75 : 0.55), p.z).project(camera);
    const W = window.innerWidth, H = window.innerHeight;
    let sx = (_v.x * 0.5 + 0.5) * W, sy = (-_v.y * 0.5 + 0.5) * H;
    const behind = _v.z > 1;
    const off = behind || sx < 20 || sx > W - 20 || sy < 20 || sy > H - 20;
    if (off && !edge) { m.classList.add('hidden'); return; }
    if (off) {
      // fuera de la pantalla: pegado al borde, en la dirección en que está
      let ax = sx - W / 2, ay = sy - H / 2;
      if (behind) { ax = -ax; ay = -ay; }
      const k = Math.min((W / 2 - 40) / Math.max(1, Math.abs(ax)), (H / 2 - 40) / Math.max(1, Math.abs(ay)));
      sx = W / 2 + ax * k; sy = H / 2 + ay * k;
    }
    m.classList.remove('hidden');
    m.classList.toggle('edge', off);
    const sp = m.querySelector('span');
    if (sp) { const t = Math.round(dist) + ' m'; if (sp.textContent !== t) sp.textContent = t; }
    m.style.transform = 'translate(' + Math.round(sx) + 'px,' + Math.round(sy) + 'px) translate(-50%,-100%)';
  }

  // ================= HUD del refugio =================
  function renderHud() {
    if (!hud) return;
    const R = G.Run;
    const k = R.active ? (R.done ? 'Jefe final' : 'Enfrentamiento ' + (R.step + 1) + ' de ' + R.STEPS) : '';
    const h = '<div class="rf-title"><b>Refugio</b><span>' + k + '</span></div>' +
      '<div class="rf-money"><span class="c">' + ICONS.coin + '<b>' + R.monedas + '</b></span><span class="p">' + ICONS.gear + '<b>' + R.piezas + '</b></span></div>';
    if (hud._h !== h) { hud._h = h; hud.innerHTML = h; }
  }

  // ================= Paneles =================
  const sel = { mapa: 0, tienda: 0, banco: 0, up: 0 };
  function open(id) {
    if (panel) close(false);
    panel = id;
    root.className = 'rf-' + id;
    root.classList.remove('hidden');
    document.body.classList.add('rf-open');
    if (player) { player.aiming = false; if (G.Input.setAim) G.Input.setAim(false); }
    if (!G.Input.isTouch && G.Input.pointerLocked && document.exitPointerLock) document.exitPointerLock();
    if (id === 'mapa') { const c = G.Run.choices(); sel.mapa = Math.min(sel.mapa, Math.max(0, c.length - 1)); }
    if (id === 'banco') { Bench.enter(); sel.up = 0; }
    render();
    if (G.Audio) G.Audio.play('pickup');
  }
  function close(relock) {
    if (!panel) return;
    if (panel === 'banco') Bench.leave();
    panel = null;
    root.classList.add('hidden');
    root.innerHTML = '';
    document.body.classList.remove('rf-open');
    if (relock !== false && !G.Input.isTouch && G.Input.enabled && G.Input.requestLock) G.Input.requestLock();
    renderHud();
  }

  function head(title) {
    const R = G.Run;
    const money = R.free ? '<span class="rf-money rf-free">Modo libre · todo gratis</span>'
      : '<span class="rf-money"><span class="c">' + ICONS.coin + '<b>' + R.monedas + '</b></span><span class="p">' + ICONS.gear + '<b>' + R.piezas + '</b></span></span>';
    return '<div class="rf-head"><b>' + title + '</b>' + money +
      '<button type="button" class="rf-x" data-a="close" aria-label="Cerrar">&#x2715;</button></div>';
  }
  function foot(okLabel) {
    return '<div class="rf-foot">' + (okLabel ? '<button type="button" data-a="ok">' + ICONS.x + okLabel + '</button>' : '') +
      '<button type="button" data-a="close">' + ICONS.o + 'Volver</button></div>';
  }

  function render() {
    if (!panel) return;
    if (panel === 'mapa') renderMap();
    else if (panel === 'tienda') renderShop();
    else if (panel === 'banco') renderBench();
  }

  // ---------- Mapa ----------
  function renderMap() {
    const R = G.Run, st = R.st;
    const W = 640, H = 300, x0 = 84, dx = (W - 84 - 56) / R.STEPS;
    const colX = (k) => x0 + dx * k;
    const rowY = (i) => (i === 0 ? 92 : 208);
    let svg = '<svg class="rf-route" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">';
    // papel: cuadrícula y manchas
    for (let x = 20; x < W; x += 40) svg += '<line class="g" x1="' + x + '" y1="10" x2="' + x + '" y2="' + (H - 10) + '"/>';
    for (let y = 20; y < H; y += 40) svg += '<line class="g" x1="10" y1="' + y + '" x2="' + (W - 10) + '" y2="' + y + '"/>';
    svg += '<path class="river" d="M10 250 C 140 210, 220 290, 330 240 S 520 180, 630 214"/>';
    // caminos: del refugio (o del último elegido) a las dos opciones de la columna siguiente
    let prev = { x: 22, y: 150 };
    for (let k = 0; k <= R.STEPS; k++) {
      const done = k < st.step, cur = k === st.step;
      if (k === R.STEPS) {
        svg += '<line class="ln' + (cur ? ' on' : '') + '" x1="' + prev.x + '" y1="' + prev.y + '" x2="' + (colX(R.STEPS) - 24) + '" y2="150"/>';
        break;
      }
      for (let i = 0; i < 2; i++) {
        const chosen = done && st.path[k] === i;
        const cls = chosen ? ' done' : (done ? ' skip' : (cur ? ' on' : ''));
        if (done && !chosen) continue;
        svg += '<line class="ln' + cls + '" x1="' + prev.x + '" y1="' + prev.y + '" x2="' + colX(k) + '" y2="' + rowY(i) + '"/>';
      }
      if (done) prev = { x: colX(k), y: rowY(st.path[k]) };
      else break;
    }
    // refugio
    svg += '<g class="nd home" transform="translate(22 150)"><circle r="14"/><g class="ic">' + ICONS.home + '</g></g>';
    for (let k = 0; k < R.STEPS; k++) {
      for (let i = 0; i < 2; i++) {
        const n = st.map[k][i], done = k < st.step, cur = k === st.step;
        const chosen = done && st.path[k] === i;
        const cls = chosen ? 'done' : (done ? 'skip' : (cur ? 'cur' + (sel.mapa === i ? ' sel' : '') : 'fut'));
        svg += '<g class="nd ' + cls + ' t-' + n.type + '" data-i="' + (cur ? i : -1) + '" transform="translate(' + colX(k) + ' ' + rowY(i) + ')">' +
          '<circle r="19"/><g class="ic">' + (chosen ? ICONS.check : ICONS[n.type]) + '</g>' +
          '<text y="36">' + R.TYPES[n.type].name + '</text></g>';
      }
      svg += '<text class="col" x="' + colX(k) + '" y="30">' + (k + 1) + '</text>';
    }
    const bx = colX(R.STEPS);
    svg += '<g class="nd boss' + (R.done ? ' cur sel' : '') + '" transform="translate(' + bx + ' 150)"><circle r="23"/><g class="ic">' + ICONS.boss + '</g><text y="42">Jefe final</text></g>';
    svg += '</svg>';

    let side;
    if (R.done) {
      side = '<h3>Jefe final</h3><p class="rf-soon">Próximamente</p><p>Superaste los cinco enfrentamientos. El jefe final todavía no está listo: puedes terminar la carrera aquí (se guarda tu resultado) o seguir en el refugio.</p>' +
        '<div class="rf-tot"><span>Puntaje total</span><b>' + st.totals.score + '</b><span>Infectados eliminados</span><b>' + st.totals.kills + '</b></div>';
    } else {
      const n = st.map[st.step][sel.mapa], T = R.TYPES[n.type];
      side = '<h3>' + T.name + '</h3><p class="rf-kicker">Enfrentamiento ' + (st.step + 1) + ' de ' + R.STEPS + (n.type === 'caza' ? ' · ' + Math.round(n.time / 60 * 10) / 10 + ' min' : ' · 3 oleadas') + '</p>' +
        '<p>' + T.text + '</p><p class="rf-foes">' + T.foes + '</p>' +
        '<div class="rf-rew"><span>Recompensa</span><b class="c">' + ICONS.coin + n.monedas + '</b><b class="p">' + ICONS.gear + n.piezas + '</b><small>+ suministros en el cofre y extra según tu puntaje</small></div>' +
        '<p class="rf-warn">Si sales a mitad de un enfrentamiento, la carrera se pierde.</p>';
    }
    root.innerHTML = '<div class="rf-pan rf-mapp">' + head('Mapa') + '<div class="rf-body"><div class="rf-paper">' + svg + '</div><div class="rf-side">' + side + '</div></div>' +
      foot(R.done ? 'Terminar carrera' : 'Iniciar enfrentamiento') + '</div>';
  }

  // ---------- Comercio ----------
  function renderShop() {
    const R = G.Run, list = R.shopList();
    sel.tienda = Math.min(sel.tienda, Math.max(0, list.length - 1));
    let cards = '';
    list.forEach((o, i) => {
      const u = G.Icons ? G.Icons.white(o.icon) : null, no = R.whyNot(o, player);
      cards += '<button type="button" class="rf-card' + (i === sel.tienda ? ' sel' : '') + (no ? ' off' : '') + (o.weapon ? ' wpn' : '') + '" data-i="' + i + '">' +
        '<span class="ic">' + (u ? '<img alt="" src="' + u + '">' : '') + '</span><span class="nm">' + o.name + (o.n > 1 ? ' <small>x' + o.n + '</small>' : '') + '</span>' +
        '<span class="pr">' + (R.free ? 'Gratis' : ICONS.coin + o.price) + '</span><span class="lf">' + (o.weapon || R.free ? '' : 'Quedan ' + o.left) + '</span></button>';
    });
    if (!list.length) cards = '<div class="rf-empty">No queda nada a la venta. Vuelve después del próximo enfrentamiento.</div>';
    const o = list[sel.tienda];
    let desc = '';
    if (o) {
      const no = R.whyNot(o, player);
      const have = o.weapon ? '' : (o.id === 'molotov' ? (player.items.molotov || 0) : (G.Weapons.ammoOfItem(o.id) ? player.ammo[G.Weapons.ammoOfItem(o.id)] : (player.items[o.id] || 0)));
      desc = '<h3>' + o.name + '</h3><p>' + (o.weapon ? 'Un arma para la carrera (con el cargador lleno). Se mejora en el banco de mejoras.' : 'Llevas ' + have + '.') + '</p>' +
        (no ? '<p class="rf-no">' + no + '</p>' : '<p class="rf-ok">' + (R.free ? 'Gratis' : ICONS.coin + o.price + ' monedas') + '</p>');
    }
    root.innerHTML = '<div class="rf-pan rf-shopp">' + head('Comercio') + '<div class="rf-body"><div class="rf-grid">' + cards + '</div><div class="rf-side">' + desc + '</div></div>' + foot(o ? 'Comprar' : null) + '</div>';
  }

  // ---------- Banco de mejoras ----------
  function benchGuns() {
    const out = [];
    for (const s of player.hands.concat(player.stored)) if (s && (G.Weapons.UPGRADES[s.id] || G.Weapons.get(s.id).special) && out.indexOf(s.id) < 0) out.push(s.id);
    return out;
  }
  function renderBench() {
    const R = G.Run, guns = benchGuns();
    sel.banco = Math.min(sel.banco, Math.max(0, guns.length - 1));
    const wid = guns[sel.banco];
    Bench.setWeapon(wid);
    let left = '';
    guns.forEach((id, i) => {
      const u = G.Icons ? G.Icons.white(id) : null;
      const ups = G.Weapons.UPGRADES[id] || [], n = ups.filter((x) => R.upgraded(id, x.id)).length;
      left += '<button type="button" class="rf-gun' + (i === sel.banco ? ' sel' : '') + '" data-g="' + i + '"><span class="ic">' + (u ? '<img alt="" src="' + u + '">' : '') + '</span><span class="nm">' + G.Weapons.get(id).name + '</span><span class="pips">' + ups.map((x) => '<i class="' + (R.upgraded(id, x.id) ? 'on' : '') + '"></i>').join('') + '</span><small>' + n + '/' + ups.length + '</small></button>';
    });
    const ups = wid ? (G.Weapons.UPGRADES[wid] || []) : [];
    sel.up = Math.min(sel.up, Math.max(0, ups.length - 1));
    let right = '';
    ups.forEach((u, i) => {
      const no = R.upgradeWhyNot(wid, u), done = R.upgraded(wid, u.id);
      right += '<button type="button" class="rf-up' + (i === sel.up ? ' sel' : '') + (done ? ' done' : (no ? ' off' : '')) + '" data-u="' + i + '"><span class="nm">' + u.name + '</span>' +
        '<span class="cost">' + (done ? 'Mejorada' : (R.free ? 'Gratis' : ICONS.gear + u.cost)) + '</span></button>';
    });
    const u = ups[sel.up];
    const w = wid ? G.Weapons.get(wid) : null;
    let info = '';
    if (w && w.special) info = '<p class="rf-udesc">Arma especial: no se puede mejorar.</p>';
    if (u) {
      const no = R.upgradeWhyNot(wid, u);
      info = '<p class="rf-udesc">' + u.desc + '</p>' + (no && no !== 'Mejorada' ? '<p class="rf-no">' + no + '</p>' : '');
    }
    const stats = w ? '<div class="rf-stats">' + statRow('Daño', (w.dmg[0] + w.dmg[1]) / 2 * (w.pellets || 1), 7) + statRow('Cadencia', 1 / w.fire, 4.5) +
      statRow('Estabilidad', w.gun === 'bow' ? 1 : 1 / ((w.kickMul || 1) + (w.swayMul || 1) - 1), 1) + (w.gun === 'bow' ? statRow('Alcance', w.range, 75) : statRow('Capacidad', w.mag, 12, w.mag)) + '</div>' : '';
    root.innerHTML = '<div class="rf-pan rf-benchp">' + head('Banco de mejoras') + '<div class="rf-body"><div class="rf-guns">' + left + '</div><div class="rf-mid"></div>' +
      '<div class="rf-ups"><h3>' + (w ? w.name : '') + '</h3>' + stats + '<div class="rf-uplist">' + right + '</div>' + info + '</div></div>' +
      foot(u && !R.upgraded(wid, u.id) ? 'Mejorar' : null) + '</div>';
  }
  function statRow(name, v, max, label) {
    const k = Math.max(0.04, Math.min(1, v / max));
    return '<div class="rf-stat"><span>' + name + '</span><i><b style="width:' + Math.round(k * 100) + '%"></b></i>' + (label != null ? '<em>' + label + '</em>' : '') + '</div>';
  }

  // ---------- Acciones ----------
  function confirm() {
    const R = G.Run;
    if (panel === 'mapa') {
      if (R.done) { close(false); if (Refugio.onFinishRun) Refugio.onFinishRun(); return; }
      const i = sel.mapa;
      close(false);
      if (Refugio.onStartEncounter) Refugio.onStartEncounter(i);
    } else if (panel === 'tienda') {
      const o = R.shopList()[sel.tienda];
      if (!o) return;
      const r = R.buy(o.id, player);
      if (r) msg(r.msg, r.fail ? 'warn' : 'good');
      render();
    } else if (panel === 'banco') {
      const wid = benchGuns()[sel.banco], u = wid && (G.Weapons.UPGRADES[wid] || [])[sel.up];
      if (!u || Bench.busy) return;
      const r = R.upgrade(wid, u.id, player);
      if (!r) return;
      if (r.fail) { msg(r.msg, 'warn'); nudge(); return; }
      Bench.play(u.id, () => { msg(r.msg, 'good'); render(); });
      render();
    }
  }
  function nudge() { const b = root.querySelector('.rf-no, .rf-foot'); if (b) { b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge'); } }

  function onClick(e) {
    const t = e.target.closest('[data-a],[data-i],[data-g],[data-u]');
    if (!t || !panel) return;
    e.preventDefault(); e.stopPropagation();
    if (t.dataset.a === 'close') { close(); return; }
    if (t.dataset.a === 'ok') { confirm(); return; }
    if (t.dataset.g != null) { if (Bench.busy) return; sel.banco = +t.dataset.g; sel.up = 0; render(); return; }
    if (t.dataset.u != null) { if (Bench.busy) return; const i = +t.dataset.u; if (sel.up === i) confirm(); else { sel.up = i; render(); } return; }
    if (t.dataset.i != null) {
      const i = +t.dataset.i;
      if (i < 0) return;
      if (panel === 'mapa') { if (sel.mapa === i) confirm(); else { sel.mapa = i; render(); } }
      else if (panel === 'tienda') { if (sel.tienda === i) confirm(); else { sel.tienda = i; render(); } }
    }
  }
  function move(dx, dy) {
    if (panel === 'mapa') { if (dy || dx) { sel.mapa = (sel.mapa + 1) % 2; render(); } }
    else if (panel === 'tienda') {
      const n = G.Run.shopList().length; if (!n) return;
      const cols = window.innerWidth < 700 ? 2 : 3;
      sel.tienda = U.clamp(sel.tienda + dx + dy * cols, 0, n - 1); render();
    } else if (panel === 'banco' && !Bench.busy) {
      if (dx) { const n = benchGuns().length; sel.banco = (sel.banco + dx + n) % n; sel.up = 0; }
      if (dy) { const wid = benchGuns()[sel.banco], n = Math.max(1, wid ? (G.Weapons.UPGRADES[wid] || []).length : 1); sel.up = (sel.up + dy + n) % n; }
      render();
    }
  }
  function onKey(e) {
    if (!panel) return;
    const c = e.code;
    let used = true;
    if (c === 'Escape' || c === 'Backspace') close();
    else if (c === 'Enter' || c === 'Space') confirm();
    else if (c === 'ArrowLeft' || c === 'KeyA') move(-1, 0);
    else if (c === 'ArrowRight' || c === 'KeyD') move(1, 0);
    else if (c === 'ArrowUp' || c === 'KeyW') move(0, -1);
    else if (c === 'ArrowDown' || c === 'KeyS') move(0, 1);
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  let padPrev = [];
  function pollPad() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads(); let p = null;
    for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { p = pads[i]; break; }
    if (!p) return;
    const now = p.buttons.map((b) => !!(b && b.pressed));
    const edge = (i) => now[i] && !padPrev[i];
    padPrev = now;
    if (!panel) return;
    if (edge(0)) confirm(); else if (edge(1)) close();
    else if (edge(14)) move(-1, 0); else if (edge(15)) move(1, 0); else if (edge(12)) move(0, -1); else if (edge(13)) move(0, 1);
  }

  // ================= Banco de mejoras en 3D =================
  // Vista desde arriba: el arma tumbada en el tapete verde, herramientas alrededor y las dos manos (con los
  // colores del personaje). Al mejorar, la izquierda sujeta el arma, la derecha trabaja con el destornillador
  // y aparece la pieza nueva (las mejoras se ven en el arma: cargador largo, cinta en la empuñadura, freno de
  // boca, muelle pulido...)
  const Bench = {
    sc: null, cam: null, gun: null, wid: null, parts: null, hands: null, tool: null, anim: null, t: 0, busy: false, on: false,
    build() {
      if (this.sc) return;
      const sc = new THREE.Scene();
      sc.background = new THREE.Color(0x0b0a09);
      sc.add(new THREE.HemisphereLight(0xfff0dc, 0x2a2018, 0.75));
      const key = new THREE.DirectionalLight(0xffe6c4, 0.95); key.position.set(-0.6, 2.2, -0.4); sc.add(key);
      const fill = new THREE.DirectionalLight(0x9fb4c8, 0.25); fill.position.set(1, 1.2, 1.4); sc.add(fill);
      // mesa (vetas) y tapete con cuadrícula
      const wood = document.createElement('canvas'); wood.width = 512; wood.height = 256;
      let x = wood.getContext('2d');
      x.fillStyle = '#4a3624'; x.fillRect(0, 0, 512, 256);
      for (let i = 0; i < 90; i++) { x.strokeStyle = 'rgba(' + (20 + Math.random() * 40 | 0) + ',' + (12 + Math.random() * 25 | 0) + ',8,' + (0.15 + Math.random() * 0.25) + ')'; x.lineWidth = 1 + Math.random() * 2; x.beginPath(); const y = Math.random() * 256; x.moveTo(0, y); x.bezierCurveTo(170, y + (Math.random() - 0.5) * 20, 340, y + (Math.random() - 0.5) * 20, 512, y + (Math.random() - 0.5) * 14); x.stroke(); }
      for (let k = 1; k < 4; k++) { x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(0, k * 64 - 1, 512, 2); }
      const tw = new THREE.CanvasTexture(wood); tw.encoding = THREE.sRGBEncoding;
      const table = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), new THREE.MeshLambertMaterial({ map: tw }));
      table.rotation.x = -Math.PI / 2; sc.add(table);
      const mc = document.createElement('canvas'); mc.width = 512; mc.height = 340;
      x = mc.getContext('2d');
      x.fillStyle = '#25503f'; x.fillRect(0, 0, 512, 340);
      x.strokeStyle = 'rgba(160,215,190,0.28)'; x.lineWidth = 1;
      for (let i = 0; i <= 512; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 340); x.stroke(); }
      for (let i = 0; i <= 340; i += 16) { x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke(); }
      x.strokeStyle = 'rgba(190,235,215,0.5)'; x.lineWidth = 2;
      for (let i = 0; i <= 512; i += 80) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 340); x.stroke(); }
      x.fillStyle = 'rgba(200,240,220,0.55)'; x.font = '12px sans-serif';
      for (let i = 0; i <= 512; i += 80) x.fillText(String(i / 16), i + 3, 14);
      x.strokeStyle = 'rgba(200,240,220,0.35)'; x.beginPath(); x.arc(420, 260, 50, 0, TAU); x.stroke(); x.beginPath(); x.moveTo(370, 260); x.lineTo(470, 260); x.moveTo(420, 210); x.lineTo(420, 310); x.stroke();
      const tm = new THREE.CanvasTexture(mc); tm.encoding = THREE.sRGBEncoding;
      const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshLambertMaterial({ map: tm }));
      mat.rotation.x = -Math.PI / 2; mat.position.set(0, 0.002, -0.02); sc.add(mat);
      this.vmat = new THREE.MeshLambertMaterial({ vertexColors: true });
      // herramientas y piezas sueltas alrededor
      const m = new G.Mesher();
      m.box(0.62, 0.008, -0.34, 0.2, 0.012, 0.03, 0x9aa0a6, 0.4); m.box(0.5, 0.012, -0.3, 0.07, 0.022, 0.036, 0xa8322a, 0.4);
      m.cyl(-0.62, 0.012, 0.36, 0.03, 0.03, 0.02, 0x8a8f94, 10); m.cyl(-0.55, 0.012, 0.4, 0.02, 0.02, 0.02, 0x8a8f94, 8);
      for (let k = 0; k < 6; k++) m.box(-0.66 + k * 0.025, 0.004, -0.38 + (k % 2) * 0.02, 0.012, 0.006, 0.006, 0xc2a24a, k);
      m.box(0.66, 0.01, 0.3, 0.12, 0.02, 0.08, 0x3d4a5a);
      m.cyl(0.4, 0.04, 0.42, 0.04, 0.035, 0.08, 0x6a6e72, 10);
      const tools = new THREE.Mesh(m.build(), this.vmat); sc.add(tools);
      const cam = new THREE.PerspectiveCamera(34, 1, 0.05, 10);
      this.sc = sc; this.cam = cam;
      this.hands = { L: this.hand(-1), R: this.hand(1) };
      sc.add(this.hands.L.g); sc.add(this.hands.R.g);
      // destornillador (en la mano derecha al trabajar)
      const tsm = new G.Mesher();
      tsm.cyl(0, 0, -0.05, 0.014, 0.016, 0.1, 0xc9452f, 8, undefined, Math.PI / 2);
      tsm.cyl(0, 0, -0.15, 0.004, 0.004, 0.1, 0xb8bcc0, 6, undefined, Math.PI / 2);
      this.tool = new THREE.Mesh(tsm.build(), this.vmat);
      this.hands.R.grip.add(this.tool);
      this.tool.visible = false;
      this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      this.flash.material.toneMapped = false; this.flash.scale.setScalar(0.18);
      sc.add(this.flash);
    },
    // mano y antebrazo (la palma hacia abajo, los dedos hacia -Z); colores del personaje
    hand(side) {
      const ch = G.Player.CHARS[player ? player.charId : 'vera'] || G.Player.CHARS.vera;
      const skin = ch.opts.skin, dark = U.shade(skin, 0.82), band = 0xd9d2bf;
      const m = new G.Mesher();
      m.cyl(0, 0, 0.2, 0.034, 0.042, 0.3, skin, 10, undefined, Math.PI / 2);
      if (side < 0) m.cyl(0, 0, 0.16, 0.037, 0.044, 0.12, band, 10, undefined, Math.PI / 2);
      m.box(0, 0, 0.0, 0.085, 0.032, 0.1, skin);
      for (let f = 0; f < 4; f++) {
        const fx = (-0.03 + f * 0.02) * side;
        m.box(fx, -0.002, -0.075 - (f === 1 || f === 2 ? 0.006 : 0), 0.017, 0.02, 0.06, f % 2 ? skin : dark);
      }
      m.box(-0.052 * side, -0.004, -0.02, 0.02, 0.02, 0.055, skin, -0.6 * side);
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(m.build(), this.vmat);
      g.add(mesh);
      const grip = new THREE.Group(); grip.position.set(0.0, -0.01, -0.08); g.add(grip);
      return { g, grip, side, p: new THREE.Vector3(), r: 0 };
    },
    setWeapon(id) {
      this.build();
      if (!id) { if (this.gun) this.gun.visible = false; return; }
      // (mientras se anima una mejora, la pieza nueva la pone la animación)
      if (this.wid === id && this.gun && (this.busy || this.partsKey === this.key(id))) return;
      if (this.gun) { this.sc.remove(this.gun); }
      this.wid = id;
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(G.Models.weaponGeometry(id), this.vmat);
      // tumbada de lado: a lo largo hacia la derecha y la parte de arriba hacia el fondo
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)));
      mesh.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(mesh), c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
      mesh.position.set(-c.x, -bb.min.y + 0.004, -c.z);
      g.add(mesh);
      this.size = s; this.len = s.x;
      // piezas de las mejoras (se ven en el arma)
      this.parts = new THREE.Group(); g.add(this.parts);
      this.buildParts(id);
      this.gun = g;
      this.sc.add(g);
      g.position.set(0, 0, 0.0);
      this.slide = 1;
    },
    key(id) { const up = (G.Run.st && G.Run.st.up[id]) || {}; return Object.keys(up).sort().join(','); },
    // Dónde va cada pieza y cómo es (en el sistema del arma tumbada: x a lo largo, z hacia la cámara)
    partInfo(id) {
      const L = this.len, s = this.size, y = s.y + 0.006, short = G.Weapons.isShort(G.Weapons.get(id));
      const gx = -L * 0.5 + (short ? L * 0.25 : L * 0.3);       // empuñadura / cargador
      const P = {};
      if (id === 'arco') {
        P.alcance = { at: [0.0, y, -0.02], style: 'arco', geo: (m) => { m.cyl(0.02, y, 0.02, 0.006, 0.006, 0.22, 0x2a2a2a, 6, undefined, Math.PI / 2); m.cyl(0.02, y, 0.13, 0.014, 0.014, 0.03, 0x8a8f94, 8, undefined, Math.PI / 2); m.box(-0.03, y, -0.03, 0.02, 0.006, 0.04, 0xd9b23a); } };
        return P;
      }
      P.capacidad = { at: [gx + L * 0.06, y * 0.5, s.z * 0.5 + 0.02], style: 'cargador',
        geo: (m) => m.box(gx + L * 0.06, y * 0.5, s.z * 0.5 + (short ? 0.03 : 0.045), short ? 0.03 : 0.05, y, short ? 0.06 : 0.09, id === 'revolver' ? 0x8a6b3a : 0x2c2e30) };
      P.estabilidad = { at: [gx - L * 0.02, y, 0.0], style: 'cinta', geo: (m) => m.box(gx - L * 0.02, y, 0.0, short ? 0.035 : 0.07, 0.004, s.z * 0.55, 0x6e5034) };
      P.retroceso = { at: [L * 0.5 + 0.012, y * 0.6, -s.z * 0.1], style: 'boca', geo: (m) => m.box(L * 0.5 + 0.012, y * 0.6, -s.z * 0.1, 0.035, y * 0.9, Math.min(0.03, s.z * 0.5), 0x3a3d40) };
      P.cadencia = { at: [0.0, y, -s.z * 0.3], style: 'tornillo', geo: (m) => m.box(0.0, y, -s.z * 0.3, L * 0.3, 0.004, 0.008, 0xd8dcdf) };
      P.dano = { at: [L * 0.3, y, -s.z * 0.1], style: 'boca', geo: (m) => m.box(L * 0.3, y, -s.z * 0.1, L * 0.3, 0.005, 0.012, 0x6b7a5a) };
      P.recarga = { at: [-L * 0.12, y, -s.z * 0.15], style: 'tornillo', geo: (m) => { m.box(-L * 0.12, y, -s.z * 0.15, 0.05, 0.005, 0.012, 0xd8dcdf); m.cyl(-L * 0.12 + 0.03, y, -s.z * 0.15, 0.008, 0.008, 0.006, 0xc9a24a, 8); } };
      return P;
    },
    buildParts(id, except) {
      while (this.parts.children.length) this.parts.remove(this.parts.children[0]);
      const up = (G.Run.st && G.Run.st.up[id]) || {};
      this.partsKey = this.key(id);
      this.info = this.partInfo(id);
      const m = new G.Mesher();
      for (const k in this.info) if (up[k] && k !== except) this.info[k].geo(m);
      if (m.count) { try { this.parts.add(new THREE.Mesh(m.build(), this.vmat)); } catch (e) { /* sin piezas */ } }
    },
    // la pieza nueva sola (para la animación), con el origen en su sitio para poder girarla o estirarla
    newPart(id, uid) {
      const I = this.partInfo(id)[uid];
      if (!I) return null;
      const m = new G.Mesher(); I.geo(m);
      const mesh = new THREE.Mesh(m.build(), this.vmat);
      const g = new THREE.Group();
      g.position.set(I.at[0], I.at[1], I.at[2]);
      mesh.position.set(-I.at[0], -I.at[1], -I.at[2]);
      g.add(mesh);
      return { g, I };
    },
    enter() {
      this.build();
      // las manos con los colores del personaje de ahora
      if (this.handsChar !== player.charId) {
        this.handsChar = player.charId;
        for (const k of ['L', 'R']) { const h = this.hands[k]; this.sc.remove(h.g); }
        this.hands = { L: this.hand(-1), R: this.hand(1) };
        this.sc.add(this.hands.L.g); this.sc.add(this.hands.R.g);
        this.hands.R.grip.add(this.tool);
      }
      this.on = true; this.busy = false; this.anim = null; this.slide = 1;
    },
    leave() { if (this.anim && this.anim.np) this.gun.remove(this.anim.np.g); this.on = false; this.busy = false; this.anim = null; this.tool.visible = false; },
    // Anima la mejora (unos 2,6 s, basada en la del vídeo de la pistola). Según la pieza:
    //   cargador  la derecha trae el cargador nuevo desde abajo y lo encaja de un empujón
    //   cinta     la derecha da vueltas alrededor de la empuñadura y la cinta se va enrollando
    //   boca      la derecha trae la pieza por delante del cañón y la enrosca (gira sobre sí misma)
    //   tornillo  la derecha trabaja con el destornillador sobre la pieza
    //   arco      la derecha acerca la mira y el estabilizador y los aprieta
    // La izquierda siempre sujeta el arma por la culata o la empuñadura.
    play(uid, done) {
      this.busy = true;
      if (this.gun) this.buildParts(this.wid, uid);
      const np = this.gun ? this.newPart(this.wid, uid) : null;
      if (np) { np.g.visible = false; this.gun.add(np.g); }
      this.anim = { t: 0, uid, done, ticks: 0, np, style: np ? np.I.style : 'tornillo' };
    },
    render(renderer, dt) {
      this.build();
      const t = (this.t += dt);
      const W = window.innerWidth, H = window.innerHeight, asp = W / H;
      // cámara desde arriba, algo inclinada; más cerca para las armas cortas
      const L = this.len || 0.6, d = 0.8 + L * 0.9;
      this.cam.aspect = asp; this.cam.fov = asp < 1 ? 52 : 34; this.cam.updateProjectionMatrix();
      this.cam.position.set(0.0 + Math.sin(t * 0.2) * 0.01, d * 1.0, d * 0.42);
      this.cam.lookAt(0, 0, 0.03);
      // el arma entra deslizándose al cambiarla
      if (this.gun) { this.slide = Math.max(0, this.slide - dt * 3.5); this.gun.position.x = -this.slide * this.slide * 0.9; this.gun.visible = true; }
      // manos: en reposo abajo, a los lados (respiran un poco)
      const HL = this.hands.L, HR = this.hands.R, s = Math.max(0.6, Math.min(1.4, L * 1.4));
      const restL = new THREE.Vector3(-0.3 * s - 0.08, 0.04, 0.38 * s + 0.12), restR = new THREE.Vector3(0.3 * s + 0.08, 0.04, 0.4 * s + 0.12);
      let pl = restL.clone(), pr = restR.clone(), rl = -0.5, rr = 0.5, tl = 0, twist = 0, toolOn = false;
      pl.y += Math.sin(t * 1.4) * 0.004; pr.y += Math.sin(t * 1.4 + 1) * 0.004;
      const A = this.anim;
      if (A) {
        A.t += dt;
        const k = A.t, st = A.style, np = A.np;
        const sz = this.size || new THREE.Vector3(0.6, 0.03, 0.1);
        const holdP = new THREE.Vector3(-L * 0.32, sz.y + 0.015, sz.z * 0.25);
        const tgt = np ? new THREE.Vector3(np.I.at[0], np.I.at[1], np.I.at[2]) : new THREE.Vector3(0.05, 0.04, 0);
        const inn = U.smooth(Math.min(1, k / 0.45)), out = U.smooth(Math.max(0, Math.min(1, (k - 2.1) / 0.45)));
        const w = inn * (1 - out);
        pl.lerp(holdP, w); rl = U.lerp(-0.5, -0.95, w);
        // mano derecha: dónde trabaja y con qué
        let RR = 0.62, reach = 0.29, work = tgt.clone();
        const carry = st === 'cargador' || st === 'boca' || st === 'arco';      // trae la pieza en la mano
        if (st === 'tornillo') toolOn = k > 0.3 && k < 2.4;
        // posición de la pieza nueva (antes de colocarse va con la mano)
        let place = U.smooth(Math.max(0, Math.min(1, (k - 0.5) / 0.9)));
        if (np) {
          np.g.visible = k > 0.25;
          np.g.scale.set(1, 1, 1); np.g.rotation.set(0, 0, 0);
          np.g.position.set(np.I.at[0], np.I.at[1], np.I.at[2]);
        }
        if (st === 'cargador') {
          // viene desde abajo (hacia la cámara) y entra de un empujón
          const off = (1 - place) * 0.28;
          if (np) np.g.position.z += off; work.z += off;
          reach = 0.12; RR = 0.3;
          if (k > 1.4 && !A.click) { A.click = true; if (G.Audio) G.Audio.play('magIn'); }
        } else if (st === 'boca' || st === 'arco') {
          // llega por delante y se enrosca
          const off = (1 - place) * 0.3;
          if (np) { np.g.position.x += off; if (st === 'boca') np.g.rotation.x = (1 - place) * 9 + Math.sin(k * 12) * 0.2 * (k < 1.6 ? 1 : 0); }
          work.x += off; reach = 0.16; RR = 0.9;
          if (k > 0.6 && k < 1.6) { twist = Math.sin(k * 14) * 0.5; A.ticks += dt; if (A.ticks > 0.25) { A.ticks = 0; if (G.Audio) G.Audio.play('dry'); } }
        } else if (st === 'cinta') {
          // vueltas alrededor de la empuñadura: la cinta crece
          const sp = Math.max(0, Math.min(1, (k - 0.45) / 1.2));
          if (np) np.g.scale.set(0.05 + 0.95 * sp, 1, 1);
          if (k > 0.45 && k < 1.65) { const a = (k - 0.45) * 11; work.x += Math.cos(a) * 0.03; work.z += Math.sin(a) * 0.03; work.y += 0.01 * Math.sin(a); A.ticks += dt; if (A.ticks > 0.3) { A.ticks = 0; if (G.Audio) G.Audio.play('rustle'); } }
          reach = 0.14; RR = 0.5;
        } else {
          // destornillador
          if (k > 0.5 && k < 2.0) {
            twist = Math.sin((k - 0.5) * 18) * 0.6;
            work.x += Math.sin((k - 0.5) * 9) * 0.006; work.z += Math.cos((k - 0.5) * 9) * 0.004;
            A.ticks += dt;
            if (A.ticks > 0.32) { A.ticks = 0; if (G.Audio) G.Audio.play(Math.random() < 0.5 ? 'dry' : 'shellIn'); }
          }
          if (np) np.g.visible = k > 1.4;
        }
        const workP = work.add(new THREE.Vector3(Math.sin(RR) * reach, 0.03, Math.cos(RR) * reach));
        pr.lerp(workP, w); rr = U.lerp(0.5, RR, w);
        if (carry && np && k < 0.5) np.g.visible = false;
        if (k > 1.5 && !A.placed) {
          A.placed = true;
          this.flash.position.copy(tgt).add(this.gun.position); this.flash.position.y += 0.02;
          this.flashT = 0.6;
          if (G.Audio && st !== 'cargador') G.Audio.play('magIn');
        }
        tl = w;
        if (k >= 2.6) {
          this.anim = null; this.busy = false;
          if (np) this.gun.remove(np.g);
          this.buildParts(this.wid);
          if (A.done) A.done();
        }
      }
      this.flashT = Math.max(0, (this.flashT || 0) - dt);
      this.flash.material.opacity = Math.min(1, this.flashT * 2.4);
      HL.g.position.copy(pl); HL.g.rotation.set(0, rl, 0);
      HR.g.position.copy(pr); HR.g.rotation.set(0, rr, twist * 0.2);
      this.tool.visible = toolOn;
      this.tool.rotation.z = twist;
      if (tl) HL.g.rotation.x = -0.15 * tl;
      renderer.render(this.sc, this.cam);
    }
  };

  // ================= Bucle =================
  function update(dt) {
    pollPad();
    const P = player;
    if (!P || !camera) return;
    // marcadores: estaciones cerca (dentro del refugio) y los maletines (siempre, también lejos)
    for (const p of Props.list) {
      const d = Math.hypot(p.x - P.pos.x, p.z - P.pos.z);
      if (p.kind === 'station') {
        const show = !panel && d < 7.5 && !(G.Loot.isOpen || G.Backpack.isOpen);
        placeMark(p, show, d, false);
        if (p.glint) { const has = G.Run.crate.length > 0; p.glint.visible = has; if (has) { p.t += dt; p.glint.material.opacity = 0.35 + 0.25 * Math.sin(p.t * 3); } }
        if (p.mark && p.id === 'cofre') p.mark.classList.toggle('has', G.Run.crate.length > 0);
      } else if (p.kind === 'case') {
        const empty = !p.f.cont.items.length;
        placeMark(p, !empty && !panel, d, true);
        p.t += dt;
        if (p.glint) { p.glint.visible = !empty; p.glint.material.opacity = 0.5 + 0.4 * Math.sin(p.t * 3.2); p.glint.scale.setScalar(0.6 + 0.12 * Math.sin(p.t * 3.2)); }
      }
    }
    // cofre de recompensas: al cerrarlo se guarda lo que cogiste
    if (crateOpen && !G.Loot.isOpen) { crateOpen = false; G.Run.keep(P); }
    // al cerrar la mochila (fabricaste algo) también
    if (inside && packWas && !G.Backpack.isOpen) G.Run.keep(P);
    packWas = G.Backpack.isOpen;
    if (inside) renderHud();
  }

  const Refugio = {
    onStartEncounter: null, onFinishRun: null,
    init(sc, pl, cam) {
      scene = sc; player = pl; camera = cam;
      root = document.createElement('div'); root.id = 'rf'; root.className = 'hidden';
      document.body.appendChild(root);
      hud = document.createElement('div'); hud.id = 'rf-hud'; hud.className = 'hidden';
      document.body.appendChild(hud);
      marks = document.createElement('div'); marks.id = 'rf-marks';
      document.body.appendChild(marks);
      root.addEventListener('click', onClick);
      root.addEventListener('pointerdown', (e) => e.stopPropagation());
      window.addEventListener('keydown', onKey, true);
    },
    set onMessage(fn) { onMsg = fn; },
    // al entrar al refugio (el mundo ya está generado con la distribución 'refugio')
    // free: el modo libre (solo el comercio y el banco, gratis; sin el HUD del refugio)
    enter(free) {
      Props.clear();
      inside = !free;
      buildStations();
      if (!free) { hud.classList.remove('hidden'); renderHud(); }
    },
    leave() {
      close(false);
      inside = false;
      Props.clear();
      hud.classList.add('hidden');
    },
    // al reiniciar el mundo
    clear() { close(false); Props.clear(); },
    update,
    open, close,
    get inside() { return inside; },
    get panelOpen() { return !!panel; },
    get panel() { return panel; },
    get wants3d() { return panel === 'banco'; },
    render3d(renderer, dt) { Bench.render(renderer, dt); },
    spawnCase,
    Bench
  };
  G.Refugio = Refugio;
})(window.Game = window.Game || {});
