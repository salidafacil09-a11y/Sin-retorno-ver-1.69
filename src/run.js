(function (G) {
  'use strict';

  // Modo Retorno: una carrera de 5 enfrentamientos (y el jefe final, todavía «próximamente") con un refugio
  // entre uno y otro. Aquí vive el estado de la carrera: el mapa de enfrentamientos, las monedas (para el
  // puesto de comercio) y las piezas (para el banco de mejoras), las mejoras de las armas, lo que hay a la
  // venta, lo que espera en el cofre de recompensas y lo que llevas encima.
  //
  // Guardado (como un roguelike): solo se guarda en el refugio. Al empezar un enfrentamiento la partida queda
  // marcada; si sales a mitad (o se cierra el juego) la carrera se pierde. Una carrera nueva desde el menú
  // principal empieza de cero (sin mejoras).

  const KEY = 'ceniza.retorno';
  const STEPS = 5;
  const U = G.Util;

  // ---------- Enfrentamientos ----------
  const TYPES = {
    asalto: { name: 'Asalto', text: 'Aguanta tres oleadas de infectados que llegan desde todo el mapa. Desde la segunda, al despejar cada oleada aparece un maletín con suministros.', foes: 'Corredores y acechadores; desde la 2.ª oleada, chasqueadores; en la 3.ª, un temblante.' },
    caza: { name: 'Caza', text: 'Sobrevive hasta que se acabe el tiempo. Los infectados no dejan de llegar (como mucho 12 a la vez) y cada vez más rápido cuanto menos falta para volver.', foes: 'Muchos corredores, algunos chasqueadores y pocos acechadores. Sin temblantes.' }
  };
  // duración de la caza según la columna del mapa (segundos)
  const CAZA_T = [120, 135, 150, 165, 180];

  // ---------- Puesto de comercio ----------
  // cada cosa tiene su probabilidad de salir a la venta (se renueva tras cada enfrentamiento)
  const SHOP = [
    { id: 'venda', name: 'Venda', icon: 'botiquin', n: 1, price: 30, p: 0.9, stock: [1, 2] },
    { id: 'humo', name: 'Bomba de humo', icon: 'humo', n: 1, price: 35, p: 0.5, stock: [1, 2] },
    { id: 'molotov', name: 'Molotov', icon: 'molotov', n: 1, price: 40, p: 0.55, stock: [1, 2] },
    { id: 'mina', name: 'Mina', icon: 'mina', n: 1, price: 45, p: 0.4, stock: [1, 1] },
    { id: 'mun_9mm', name: 'Balas de 9 mm', icon: 'mun_9mm', n: 6, price: 20, p: 0.95, stock: [1, 3] },
    { id: 'mun_cartucho', name: 'Cartuchos', icon: 'mun_cartucho', n: 4, price: 30, p: 0.6, stock: [1, 2] },
    { id: 'mun_rifle', name: 'Balas de rifle', icon: 'mun_rifle', n: 3, price: 30, p: 0.5, stock: [1, 2] },
    { id: 'mun_flecha', name: 'Flechas', icon: 'mun_flecha', n: 4, price: 25, p: 0.5, stock: [1, 2] },
    { id: 'mun_revolver', name: 'Balas de revólver', icon: 'mun_revolver', n: 4, price: 25, p: 0.45, stock: [1, 2] },
    { id: 'mun_smg', name: 'Balas de subfusil', icon: 'mun_smg', n: 16, price: 30, p: 0.4, stock: [1, 2] },
    { id: 'mun_gas', name: 'Combustible', icon: 'mun_gas', n: 20, price: 35, p: 0.4, stock: [1, 2] },
    { id: 'pistola', name: 'Pistola semiautomática', icon: 'pistola', weapon: true, price: 90, p: 0.35, stock: [1, 1] },
    { id: 'escopeta', name: 'Escopeta de corredera', icon: 'escopeta', weapon: true, price: 160, p: 0.45, stock: [1, 1] },
    { id: 'rifle', name: 'Rifle de cerrojo', icon: 'rifle', weapon: true, price: 190, p: 0.35, stock: [1, 1] },
    { id: 'arco', name: 'Arco', icon: 'arco', weapon: true, price: 140, p: 0.4, stock: [1, 1] },
    { id: 'revolver', name: 'Revólver', icon: 'revolver', weapon: true, price: 130, p: 0.4, stock: [1, 1] },
    { id: 'doble', name: 'Escopeta de doble cañón', icon: 'doble', weapon: true, price: 170, p: 0.35, stock: [1, 1] },
    { id: 'subfusil', name: 'Subfusil silenciado', icon: 'subfusil', weapon: true, special: true, price: 230, p: 0.25, stock: [1, 1] },
    { id: 'lanzallamas', name: 'Lanzallamas', icon: 'lanzallamas', weapon: true, special: true, price: 260, p: 0.2, stock: [1, 1] }
  ];

  // ---------- Desafíos ----------
  // Cada uno, la primera vez que lo completas en una carrera, deja un arma gratis (una que no tengas) en el cofre
  // del refugio. Se cuenta también cuántas veces los has hecho en total (en el menú de Desafíos)
  const CHALLENGES = [
    { id: 'sigilo_chasq', name: 'Silencio mortal', text: 'Mata a un chasqueador por la espalda sin que se entere.' },
    { id: 'molotov_temb', name: 'Fuego al gigante', text: 'Mata a un temblante con una molotov.' },
    { id: 'cabezas', name: 'Puntería', text: 'Mata a 5 infectados de un disparo en la cabeza en un mismo enfrentamiento.' },
    { id: 'remates', name: 'Sin piedad', text: 'Remata a 3 infectados aturdidos en un mismo enfrentamiento.' },
    { id: 'intacta', name: 'Ni un rasguño', text: 'Supera una oleada de un asalto sin recibir daño.' },
    { id: 'cazador', name: 'Cazadora', text: 'Elimina a 15 infectados en una caza.' }
  ];
  const CKEY = 'ceniza.desafios';
  const GIFTS = ['revolver', 'doble', 'escopeta', 'rifle', 'arco', 'subfusil', 'lanzallamas'];
  function chalRecord() { try { return JSON.parse(localStorage.getItem(CKEY) || '{}') || {}; } catch (e) { return {}; } }

  let st = null;          // estado de la carrera (null: no hay)
  let inRefuge = false;

  function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  function makeMap() {
    const cols = [];
    for (let k = 0; k < STEPS; k++) {
      // dos caminos por paso: casi siempre uno de cada; a veces dos iguales
      const a = Math.random() < 0.5 ? 'asalto' : 'caza';
      const b = Math.random() < 0.8 ? (a === 'asalto' ? 'caza' : 'asalto') : a;
      cols.push([a, b].map((type) => ({
        type,
        time: type === 'caza' ? CAZA_T[k] : 0,
        // recompensa: el asalto da más piezas; la caza, más monedas
        piezas: (type === 'asalto' ? 55 : 35) + k * 12 + rint(0, 3) * 5,
        monedas: (type === 'asalto' ? 40 : 60) + k * 10 + rint(0, 3) * 5
      })));
    }
    return cols;
  }

  function makeShop(player) {
    const out = [];
    for (const s of SHOP) {
      if (s.weapon && player && player.weapons.some((w) => w.id === s.id)) continue;
      if (Math.random() >= s.p) continue;
      out.push({ id: s.id, left: rint(s.stock[0], s.stock[1]) });
    }
    // siempre hay algo de munición de pistola
    if (!out.some((o) => o.id === 'mun_9mm')) out.unshift({ id: 'mun_9mm', left: 1 });
    return out;
  }

  // lo que te espera en el cofre después de un enfrentamiento
  function rewardSupplies(type, k) {
    const pool = { alcohol: 3, trapo: 3, clavos: 2, polvo: 1.2, mun_9mm: 2.5, venda: 1 };
    const n = 2 + (k >= 2 ? 1 : 0) + (type === 'asalto' ? 0 : 1);
    const out = [];
    for (let i = 0; i < n; i++) {
      const id = U.weighted(Math.random, pool);
      const ex = out.find((e) => e.id === id);
      const q = id === 'mun_9mm' ? rint(3, 6) : 1;
      if (ex) ex.cond += q; else out.push({ id, cond: q });
    }
    return out;
  }

  // ---------- Inventario (entre el refugio y los enfrentamientos) ----------
  const clone = (o) => (o ? JSON.parse(JSON.stringify(o)) : o);
  function snapshot(p) {
    return {
      hands: clone(p.hands), stored: clone(p.stored), items: clone(p.items), ammo: clone(p.ammo),
      backpack: !!p.backpack, silencers: p.silencers || 0, arrowExp: !!p.arrowExp, throwable: p.throwable || null
    };
  }
  function restore(p, s) {
    if (!s) return;
    p.hands = clone(s.hands) || [];
    while (p.hands.length < 5) p.hands.push(null);
    p.stored = (clone(s.stored) || []).filter(Boolean);
    for (const k in s.items) p.items[k] = s.items[k];
    for (const k in s.ammo) p.ammo[k] = s.ammo[k];
    p.backpack = s.backpack !== false; p.silencers = s.silencers || 0; p.arrowExp = !!s.arrowExp; p.throwable = s.throwable || null;
    // las armas de fuego no traen más balas de las que caben ahora en el cargador
    for (const h of p.hands.concat(p.stored)) if (h && h.mag != null) h.mag = Math.min(h.mag, G.Weapons.get(h.id).mag);
    // (partidas viejas: las armas de fuego ya no se rompen)
    for (const h of p.hands.concat(p.stored)) if (h && G.Weapons.isGun(G.Weapons.get(h.id))) { h.broken = false; h.cond = 1; }
    p.cur = -1; p.prev = -1;
    G.Models.setBackpack(p.model, p.backpack);
    p.refreshModel();
  }

  function save() {
    if (!st || st.free) return;           // el modo libre no se guarda
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* sin guardado */ }
  }
  function readSave() {
    try { const t = localStorage.getItem(KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; }
  }

  const Run = {
    STEPS, TYPES, SHOP,
    get active() { return !!st; },
    get st() { return st; },
    get inRefuge() { return inRefuge; },
    set inRefuge(v) { inRefuge = !!v; },
    get step() { return st ? st.step : 0; },
    get monedas() { return st ? st.monedas : 0; },
    get piezas() { return st ? st.piezas : 0; },
    get done() { return !!st && st.step >= STEPS; },

    // ¿Hay una carrera guardada que se puede continuar? (si saliste en medio de un enfrentamiento, se perdió)
    saveInfo() {
      const s = readSave();
      if (!s || s.v !== 1) return null;
      if (s.inEnc) return { lost: true, char: s.char, step: s.step };
      return { lost: false, char: s.char, step: s.step };
    },
    discard() { st = null; inRefuge = false; try { localStorage.removeItem(KEY); } catch (e) { /* nada */ } G.Weapons.applyUpgrades(null); },

    // Carrera nueva: solo con la pistola (cargador lleno y un cargador de reserva) y una venda
    newRun(charId, player) {
      st = {
        v: 1, char: charId, step: 0, path: [], map: makeMap(), monedas: 60, piezas: 0, up: {},
        inv: null, shop: [], crate: [{ id: 'alcohol', cond: 1 }, { id: 'trapo', cond: 1 }], inEnc: false, enc: null, chal: {}, gifts: [],
        totals: { kills: 0, time: 0, score: 0 }, last: null
      };
      G.Weapons.applyUpgrades(st.up);
      if (player) {
        player.hands = [null, null, null, null, null]; player.stored = [];
        player.pickUp('pistola', G.Weapons.get('pistola').mag, 1);
        player.ammo['9mm'] = 6;
        player.items.venda = 1;
        player.equip(-1);
        st.inv = snapshot(player);
      }
      st.shop = makeShop(player);
      save();
    },
    // Continuar la carrera guardada
    load() {
      const s = readSave();
      if (!s || s.v !== 1 || s.inEnc) return false;
      st = s;
      G.Weapons.applyUpgrades(st.up);
      return true;
    },
    save,

    // ---------- Refugio ----------
    // al llegar al refugio: lo que llevas vuelve (con la vida llena) y se guarda
    enterRefuge(player) {
      if (!st) return;
      inRefuge = true;
      st.inEnc = false; st.enc = null;
      // las armas regaladas por los desafíos esperan en el cofre
      this.newGifts = [];
      for (const id of st.gifts || []) { const w = G.Weapons.get(id); st.crate.unshift({ id, cond: w.mag, dur: 1 }); this.newGifts.push(id); }
      st.gifts = [];
      G.Weapons.applyUpgrades(st.up);
      restore(player, st.inv);
      player.health = 100; player.heal = 0;
      save();
    },
    // lo que llevas, otra vez encima (al empezar un enfrentamiento, tras reiniciar el mundo)
    restoreInv(player) { if (st) { G.Weapons.applyUpgrades(st.up); restore(player, st.inv); } },
    // guarda lo que llevas (cada vez que cambia algo en el refugio)
    keep(player) { if (!st || !player) return; st.inv = snapshot(player); save(); },

    // ---------- Mapa ----------
    choices() { return st && st.step < STEPS ? st.map[st.step] : []; },
    // empieza el enfrentamiento i de la columna actual (queda marcado: salir a mitad pierde la carrera)
    beginEncounter(i, player) {
      if (!st || st.step >= STEPS) return null;
      const node = st.map[st.step][i];
      if (!node) return null;
      st.inv = snapshot(player);
      st.enc = { col: st.step, i, type: node.type, time: node.time };
      st.inEnc = true;
      inRefuge = false;
      save();
      return st.enc;
    },
    get encounter() { return st ? st.enc : null; },
    // enfrentamiento superado: recompensas (piezas y monedas al momento; suministros al cofre)
    winEncounter(player, score, stats) {
      if (!st || !st.enc) return null;
      const e = st.enc, node = st.map[e.col][e.i];
      const bonusM = Math.round((score || 0) / 8), bonusP = Math.round((stats ? stats.kills : 0) * 2);
      const got = { piezas: node.piezas + bonusP, monedas: node.monedas + bonusM, supplies: rewardSupplies(e.type, e.col) };
      st.piezas += got.piezas; st.monedas += got.monedas;
      for (const s of got.supplies) { const ex = st.crate.find((c) => c.id === s.id); if (ex) ex.cond += s.cond; else st.crate.push(s); }
      st.path.push(e.i);
      st.step++;
      st.totals.score += score || 0;
      if (stats) { st.totals.kills += stats.kills || 0; st.totals.time += stats.time || 0; }
      st.inv = snapshot(player);
      st.shop = makeShop(player);
      st.last = got;
      // el enfrentamiento ya terminó: si sales ahora, se continúa desde el refugio
      st.inEnc = false;
      save();
      return got;
    },

    // ---------- Comercio ----------
    shopList() { return st ? st.shop.map((o) => Object.assign({}, SHOP.find((s) => s.id === o.id), { left: o.left }, st.free ? { price: 0 } : {})) : []; },
    // Modo libre: comercio y banco de mejoras gratis (todo a la venta, sin gastar nada). No se guarda
    get free() { return !!(st && st.free); },
    startFree(charId) {
      st = {
        v: 1, free: true, char: charId, step: 0, path: [], map: makeMap(), monedas: 0, piezas: 0, up: {},
        inv: null, shop: SHOP.map((s) => ({ id: s.id, left: 99 })), crate: [], inEnc: false, enc: null, chal: {}, gifts: [],
        totals: { kills: 0, time: 0, score: 0 }, last: null
      };
      inRefuge = false;
      G.Weapons.applyUpgrades(st.up);
    },
    endFree() { if (st && st.free) { st = null; inRefuge = false; G.Weapons.applyUpgrades(null); } },
    // por qué no se puede comprar (o null)
    whyNot(o, player) {
      if (!o || o.left <= 0) return 'Agotado';
      if (st.monedas < o.price) return 'Te faltan monedas';
      if (o.weapon) return player.weapons.some((w) => w.id === o.id) ? 'Ya la tienes' : (player.spotFor(o.id) ? null : 'Sin espacio');
      if (o.id === 'molotov') return player.fullOf('molotov') ? 'No te caben más' : null;
      return player.itemRoom(o.id) > 0 ? null : 'No te caben más';
    },
    buy(id, player) {
      if (!st) return null;
      const o = this.shopList().find((x) => x.id === id);
      const no = this.whyNot(o, player);
      if (no) return { msg: no, fail: true };
      let msg;
      if (o.weapon) {
        const w = G.Weapons.get(o.id);
        const r = player.pickUp(o.id, w.mag, 1);
        if (!r.ok) return { msg: 'Sin espacio', fail: true };
        player.equip(-1);
        msg = 'Compraste: ' + w.name;
      } else if (o.id === 'molotov') {
        player.items.molotov = (player.items.molotov || 0) + 1; msg = 'Compraste una molotov';
      } else {
        const r = player.takeItem(o.id, o.n);
        msg = 'Compraste: ' + (o.n > 1 ? o.n + ' ' : '') + o.name.toLowerCase() + (r.left > 0 ? ' (no te cabía todo)' : '');
      }
      st.monedas -= o.price;
      const so = st.shop.find((x) => x.id === id);
      if (!st.free) { so.left--; if (so.left <= 0 && o.weapon) st.shop.splice(st.shop.indexOf(so), 1); }
      this.keep(player);
      if (G.Audio) G.Audio.play('pickup');
      return { msg };
    },

    // ---------- Mejoras ----------
    upgraded(wid, uid) { return !!(st && st.up[wid] && st.up[wid][uid]); },
    upgradeWhyNot(wid, u) {
      if (!st) return 'Sin carrera';
      if (this.upgraded(wid, u.id)) return 'Mejorada';
      if (u.req && !this.upgraded(wid, u.req)) return 'Antes: ' + G.Weapons.UPGRADES[wid].find((x) => x.id === u.req).name;
      if (!st.free && st.piezas < u.cost) return 'Te faltan piezas';
      return null;
    },
    upgrade(wid, uid, player) {
      const u = (G.Weapons.UPGRADES[wid] || []).find((x) => x.id === uid);
      if (!u) return { msg: 'No existe', fail: true };
      const no = this.upgradeWhyNot(wid, u);
      if (no) return { msg: no, fail: true };
      if (!st.free) st.piezas -= u.cost;
      (st.up[wid] || (st.up[wid] = {}))[uid] = true;
      G.Weapons.applyUpgrades(st.up);
      // con más capacidad, el cargador se llena gratis (como en el banco del vídeo de referencia)
      if (uid === 'capacidad') for (const h of player.hands.concat(player.stored)) if (h && h.id === wid) h.mag = G.Weapons.get(wid).mag;
      this.keep(player);
      return { msg: G.Weapons.get(wid).name + ': ' + u.name + ' mejorada' };
    },

    // ---------- Cofre de recompensas ----------
    get crate() { return st ? st.crate : []; },

    // ---------- Desafíos ----------
    CHALLENGES,
    chalDone(id) { return !!(st && st.chal && st.chal[id]); },
    chalTimes(id) { return chalRecord()[id] || 0; },
    // completar un desafío (en una carrera): una sola vez por carrera; devuelve el arma regalada (o null)
    challenge(id, player) {
      if (!st || !CHALLENGES.find((c) => c.id === id)) return null;
      st.chal = st.chal || {}; st.gifts = st.gifts || [];
      if (st.chal[id]) return null;
      st.chal[id] = true;
      const rec = chalRecord(); rec[id] = (rec[id] || 0) + 1;
      try { localStorage.setItem(CKEY, JSON.stringify(rec)); } catch (e) { /* nada */ }
      // un arma que no tengas, ni esté ya en el cofre, ni regalada
      const have = new Set((player ? player.weapons.map((w) => w.id) : []).concat(st.crate.map((c) => c.id), st.gifts));
      const pool = GIFTS.filter((g) => !have.has(g));
      let gift = null;
      if (pool.length) { gift = pool[Math.floor(Math.random() * pool.length)]; st.gifts.push(gift); }
      else st.monedas += 60;
      save();
      return { gift, c: CHALLENGES.find((c) => c.id === id) };
    },

    // ---------- Final ----------
    get totals() { return st ? st.totals : null; },
    get last() { return st ? st.last : null; }
  };

  G.Run = Run;
})(window.Game = window.Game || {});
