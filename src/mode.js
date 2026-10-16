(function (G) {
  'use strict';

  // Enfrentamientos (modo Retorno; inspirados en los modos por oleadas de referencia, con reglas propias):
  //
  //   ASALTO  preparación (20 s, «OLEADA ENTRANTE») → oleada 1/3 → «PRÓXIMA OLEADA EN…» → 2/3 → … → 3/3 →
  //           «ENFRENTAMIENTO COMPLETADO» → «REGRESANDO AL REFUGIO» → estadísticas.
  //           Los infectados nunca aparecen juntos: cada uno sale lejos de los demás, repartidos por el mapa.
  //             oleada 1: 3 (a veces 4): corredores y algún acechador
  //             oleada 2: 5 (a veces 6): corredores, acechadores y chasqueadores (como mucho 3)
  //             oleada 3: 6 (a veces 7): de todo, con un temblante (muy de vez en cuando, 2)
  //           Desde la 2.ª oleada, al despejarla aparece un maletín con suministros.
  //
  //   CAZA    aguanta hasta que se acabe el tiempo. Los infectados llegan sin parar (como mucho 12 a la vez) y
  //           cada vez más seguido cuanto menos falta. Sin temblantes; algunos chasqueadores, muchos corredores
  //           y pocos acechadores.
  //
  // Los infectados a veces sueltan algo al morir (munición, materiales o una chocolatina que cura un poco).
  // Desafío de cada enfrentamiento: agarrar y matar a uno por sorpresa (recompensa: 2 vendas).
  // En este modo los mordiscos hacen daño pero no infectan.

  const U = G.Util;
  const SPEAKER = 'Vera';
  const PREP = 20, BETWEEN = 20, RETURN = 12, BANNER = 4;
  const CAZA_MAX = 12;
  const MAX_CORPSES = 8;
  // probabilidad de soltar algo al morir
  const DROP = { runner: 0.4, stalker: 0.5, blind: 0.55, temb: 1 };
  const BARKS = {
    start: ['Vamos allá.', 'Que vengan.', 'Respira... tú puedes.'],
    wave: ['Ahí vienen.', 'Los oigo.', 'Prepárate.'],
    blind: ['Chasqueadores. Sin hacer ruido.', 'Ese no ve... pero oye.'],
    temb: ['Eso es enorme...', 'Un temblante. Mantén la distancia.'],
    kill: ['Uno menos.', 'Quieto.', 'Ya está.', 'Fuera.', 'No te levantes.'],
    free: ['¡Suéltame!', '¡Aparta!', '¡Quita de encima!'],
    stealth: ['Shh...', 'Tranquilo... duérmete.'],
    last: ['Queda uno.', 'El último.'],
    clear: ['Bien.', 'Despejado.', 'Por ahora...'],
    chest: ['Suministros. Bien.', 'Hay un maletín por ahí.'],
    done: ['Lo logramos.', 'Hora de volver.'],
    hurry: ['Ya casi...', 'Aguanta un poco más.'],
    hurt: ['¡Ah!', '¡Agh!'],
    reload: ['Recargando.', 'Cubridme... ah, no hay nadie.']
  };

  let scene = null, player = null;
  let st = null;            // estado del enfrentamiento
  const el = (id) => document.getElementById(id);
  const $ = {};

  function newStats() {
    return { kills: 0, melee: 0, exec: 0, gunKills: 0, head: 0, shots: 0, hits: 0, stun: 0, escapes: 0, hurt: 0, stealth: 0, thrown: 0, picked: 0, time: 0 };
  }
  const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // Composición de cada oleada del asalto
  function waveQueue(n) {
    const q = [];
    const add = (kind, k) => { for (let i = 0; i < k; i++) q.push({ kind }); };
    if (n === 1) {
      const total = Math.random() < 0.25 ? 4 : 3;
      const stalk = Math.random() < 0.45 ? 1 : 0;
      add('stalker', stalk); add('runner', total - stalk);
      return shuffle(q);
    }
    if (n === 2) {
      const total = Math.random() < 0.25 ? 6 : 5;
      const r = Math.random(), blind = r < 0.35 ? 1 : (r < 0.75 ? 2 : 3);
      const r2 = Math.random(), stalk = r2 < 0.25 ? 0 : (r2 < 0.85 ? 1 : 2);
      add('blind', blind); add('stalker', stalk); add('runner', Math.max(1, total - blind - stalk));
      return shuffle(q);
    }
    const total = Math.random() < 0.25 ? 7 : 6;
    const temb = Math.random() < 0.12 ? 2 : 1;
    const blind = rint(1, 2), stalk = rint(1, 2);
    add('blind', blind); add('stalker', stalk); add('runner', Math.max(1, total - temb - blind - stalk));
    shuffle(q);
    // el temblante llega a mitad de la oleada (no el primero)
    for (let i = 0; i < temb; i++) q.splice(Math.min(q.length, 2 + i * 2), 0, { kind: 'temb' });
    return q;
  }
  function cazaKind() {
    const r = Math.random();
    return r < 0.64 ? 'runner' : (r < 0.86 ? 'blind' : 'stalker');
  }

  const Mode = {
    active: false, fighting: false, stats: null, onMessage: null, onFinish: null, onFade: null,
    retorno: false,

    init(sc, pl) {
      scene = sc; player = pl;
      for (const k of ['mode-hud', 'm-title', 'm-timer', 'm-tlabel', 'm-tval', 'm-wave', 'm-wlabel', 'm-bar', 'm-icons', 'm-chal', 'm-cn', 'm-banner', 'm-btext', 'm-sub', 'm-stats', 'm-rows', 'm-total']) $[k] = el(k);
    },

    // Empieza un enfrentamiento. opts: { type: 'asalto' | 'caza', time (caza, segundos), retorno }
    start(opts) {
      opts = opts || {};
      this.active = true; this.fighting = false;
      this.retorno = !!opts.retorno;
      this.stats = newStats();
      G.Combat.stats = this.stats;
      const type = opts.type === 'caza' ? 'caza' : 'asalto';
      st = { type, phase: 'prep', t: type === 'caza' ? 8 : PREP, wave: 0, queue: [], spawnT: 0, list: [], corpses: [], seen: new Set(), barkT: 0, chal: false, titleT: 7,
        hurtHp: player.health, blindT: 0, total: type === 'caza' ? (opts.time || 150) : 0, left: 0, cazaN: 0, cases: [] };
      // equipo de salida fuera de una carrera (prueba suelta): pistola con el cargador lleno, algo de munición y una venda
      if (!this.retorno && !G.DEV) {
        player.pickUp('pistola', G.Weapons.get('pistola').mag, 1);
        player.ammo['9mm'] = 6;
        player.items.venda = Math.max(player.items.venda, 1);
        player.equip(-1);
      }
      player.noInfect = true;
      G.Pickups.spawn(7, { weights: { ladrillo: 2, botella: 2, alcohol: 1.4, trapo: 1, mun_9mm: 1.2, clavos: 0.6, polvo: 0.25 } });
      $['mode-hud'].classList.remove('hidden');
      $['m-title'].innerHTML = type === 'caza' ? '<b>CAZA</b><span>AGUANTA HASTA EL REGRESO</span>' : '<b>ASALTO</b><span>DESPEJA CADA OLEADA</span>';
      $['m-title'].classList.remove('hidden', 'out');
      $['m-wave'].classList.add('hidden');
      $['m-banner'].classList.add('hidden');
      $['m-stats'].classList.add('hidden');
      this.setTimer(type === 'caza' ? 'LOS INFECTADOS SE ACERCAN' : 'OLEADA ENTRANTE', st.t);
      this.renderChal();
      setTimeout(() => this.bark('start'), 1200);
    },

    stop() {
      this.active = false; this.fighting = false;
      G.Combat.stats = null; this.stats = null; st = null;
      if (player) player.noInfect = false;
      if ($['mode-hud']) $['mode-hud'].classList.add('hidden');
      if ($['m-stats']) $['m-stats'].classList.add('hidden');
      if ($['m-sub']) $['m-sub'].classList.add('hidden');
    },

    // ---------- Frases (subtítulos abajo al centro) ----------
    bark(kind) {
      if (!this.active || !st) return;
      const L = BARKS[kind];
      if (!L) return;
      const now = performance.now() / 1000;
      if (kind === 'kill' && (now - (st.lastBark || 0) < 6 || Math.random() < 0.45)) return;
      if (now - (st.lastBark || 0) < 1.2) return;
      st.lastBark = now;
      const line = L[Math.floor(Math.random() * L.length)];
      const s = $['m-sub'];
      s.innerHTML = '<b>' + ((player && player.charName) || SPEAKER) + ':</b> ' + line;
      s.classList.remove('hidden');
      clearTimeout(s._t);
      s._t = setTimeout(() => s.classList.add('hidden'), 2600);
    },

    // ---------- HUD ----------
    setTimer(label, t) {
      const tm = $['m-timer'];
      if (!label) { tm.classList.add('hidden'); return; }
      tm.classList.remove('hidden');
      if ($['m-tlabel'].textContent !== label) $['m-tlabel'].textContent = label;
      const v = t >= 60 ? Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0') : Math.max(0, t).toFixed(1);
      if ($['m-tval'].textContent !== v) $['m-tval'].textContent = v;
    },
    renderWave() {
      const alive = st.list.filter((z) => z.alive);
      const left = st.queue.length + alive.length;
      const total = Math.max(1, st.waveTotal || left);
      $['m-wlabel'].textContent = 'Oleada ' + st.wave + '/3';
      $['m-bar'].firstElementChild.style.width = (left / total * 100).toFixed(1) + '%';
      // un muñeco por enemigo que queda (los chasqueadores con la cabeza marcada; el temblante, grande)
      const kinds = st.queue.map((q) => q.kind).concat(alive.map((z) => (z.temb ? 'temb' : z.blind ? 'blind' : 'x')));
      const nb = kinds.filter((k) => k === 'blind').length, nt = kinds.filter((k) => k === 'temb').length;
      const key = left + '|' + nb + '|' + nt;
      if ($['m-icons']._k !== key) {
        $['m-icons']._k = key;
        let h = '';
        for (let i = 0; i < left; i++) h += '<i class="' + (i < nt ? 't' : (i < nt + nb ? 'b' : '')) + '"></i>';
        $['m-icons'].innerHTML = h;
      }
    },
    renderChal() {
      const c = $['m-chal'];
      c.classList.toggle('done', !!st.chal);
      $['m-cn'].textContent = (st.chal ? 1 : 0) + '/1';
    },
    banner(text, sec) {
      $['m-btext'].textContent = text;
      $['m-banner'].classList.remove('hidden');
      clearTimeout($['m-banner']._t);
      $['m-banner']._t = setTimeout(() => $['m-banner'].classList.add('hidden'), sec * 1000);
    },

    // ---------- Oleadas ----------
    beginWave(n) {
      st.wave = n; st.phase = 'wave';
      st.queue = waveQueue(n);
      st.waveTotal = st.queue.length;
      st.waveHurt = this.stats.hurt; st.waveHp = player.health;
      st.alive = n === 1 ? st.queue.length : (n === 2 ? 5 : 6);
      st.spawnT = 0.6;
      this.fighting = true;
      this.setTimer(null);
      $['m-title'].classList.add('hidden');
      $['m-wave'].classList.remove('hidden');
      this.renderWave();
      this.bark('wave');
      if (this.onMessage) this.onMessage('Oleada ' + n + ' de 3', 'bad');
    },

    // Sitio para que aparezca uno: lejos de ti, donde no lo veas, en el suelo libre y, sobre todo, lejos de los
    // otros infectados (nunca salen juntos: quedan repartidos por el mapa)
    spawnPoint() {
      const W = G.World, A0 = W.ARENA_MIN + 2, A1 = W.ARENA_MAX - 2;
      const size = A1 - A0, dMin = Math.min(14, size * 0.3), dBest = Math.min(26, size * 0.55);
      const cf = G.Camera.forward();
      const others = G.Population.list.filter((z) => z.alive);
      let best = null, bs = -Infinity;
      for (let i = 0; i < 80; i++) {
        const x = U.lerp(A0, A1, Math.random()), z = U.lerp(A0, A1, Math.random());
        const d = Math.hypot(x - player.pos.x, z - player.pos.z);
        if (d < dMin || W.circleBlocked(x, z, 0.4, 0)) continue;
        let s = -Math.abs(d - dBest) * 0.12;
        const ang = Math.atan2(x - player.pos.x, z - player.pos.z);
        if (Math.abs(U.angleDiff(ang, Math.atan2(cf.x, cf.z))) > 1.2) s += 2;     // fuera de cámara
        if (!W.hasLOS(player.pos.x, player.pos.z, x, z, 0)) s += 1.5;                // detrás de algo
        if (W.isIndoor(Math.floor(x), Math.floor(z), 0)) s -= 0.5;
        // repartidos: cuanto más lejos del infectado más cercano, mejor (y de los que acaban de salir)
        let near = 40;
        for (const o of others) near = Math.min(near, Math.hypot(o.pos.x - x, o.pos.z - z));
        for (const p of st.recent || []) near = Math.min(near, Math.hypot(p.x - x, p.z - z) + 2);
        s += Math.min(near, 16) * 0.35;
        if (near < 6) s -= 4;
        if (s > bs) { bs = s; best = { x, z }; }
      }
      if (best) { (st.recent || (st.recent = [])).push(best); if (st.recent.length > 4) st.recent.shift(); }
      return best;
    },

    spawnOne(q) {
      const p = this.spawnPoint();
      if (!p) return false;
      const kind = q.kind || 'runner';
      const zb = new G.Zombie(scene, p.x, p.z, null, Math.atan2(player.pos.x - p.x, player.pos.z - p.z),
        { hunter: true, blind: kind === 'blind', temb: kind === 'temb', stalker: kind === 'stalker', lv: 0 });
      zb.wave = st.wave; zb.kind = kind;
      if (kind === 'runner' || kind === 'temb') { zb.state = 'chase'; zb.target = { x: player.pos.x, z: player.pos.z, lv: 0 }; zb.lastSeen = 0; zb.screamed = true; }
      else { zb.target = { x: player.pos.x + (Math.random() - 0.5) * 8, z: player.pos.z + (Math.random() - 0.5) * 8, lv: 0 }; zb.enter('investigate', 10); }
      G.Population.list.push(zb);
      st.list.push(zb);
      if (kind === 'blind' && !st.blindSaid) { st.blindSaid = true; setTimeout(() => this.bark('blind'), 1500); }
      if (kind === 'temb' && !st.tembSaid) { st.tembSaid = true; setTimeout(() => this.bark('temb'), 1800); }
      return true;
    },

    // Maletín de suministros tras una oleada (desde la 2.ª): siempre trae munición y algo más, lo justo para
    // aguantar el principio de la siguiente
    spawnCase() {
      const items = [];
      const guns = player.weapons.map((s) => G.Weapons.get(s.id)).filter((w) => G.Weapons.isGun(w));
      const ammoOf = (w) => G.Weapons.AMMO[w.ammo].item;
      items.push({ id: 'mun_9mm', cond: rint(4, 7) });
      const other = guns.filter((w) => w.ammo !== '9mm');
      if (other.length && Math.random() < 0.7) { const w = other[Math.floor(Math.random() * other.length)]; const bx = G.Weapons.AMMO[w.ammo].box; items.push({ id: ammoOf(w), cond: rint(bx[0], bx[1]) }); }
      const extra = [['venda', 0.45, 1], ['chocolatina', 0.6, 1], ['clavos', 0.4, 2], ['alcohol', 0.5, 1], ['polvo', 0.3, 1], ['trapo', 0.35, 1]];
      for (const [id, p, n] of extra) if (Math.random() < p) items.push({ id, cond: n });
      if (items.length < 3) items.push({ id: Math.random() < 0.5 ? 'venda' : 'chocolatina', cond: 1 });
      // dónde: a la vista, a unos metros, en el suelo libre
      const W = G.World, A0 = W.ARENA_MIN + 3, A1 = W.ARENA_MAX - 3;
      let best = null, bs = -Infinity;
      for (let i = 0; i < 60; i++) {
        const x = U.lerp(A0, A1, Math.random()), z = U.lerp(A0, A1, Math.random());
        if (W.circleBlocked(x, z, 0.5, 0) || W.furnTop(x, z, 0, 0.4) > 0) continue;
        const d = Math.hypot(x - player.pos.x, z - player.pos.z);
        const s = -Math.abs(d - 11) - (W.hasLOS(player.pos.x, player.pos.z, x, z, 0) ? 0 : 3);
        if (s > bs) { bs = s; best = { x, z }; }
      }
      if (!best || !G.Refugio) return;
      st.cases.push(G.Refugio.spawnCase(best.x, best.z, items));
      setTimeout(() => this.bark('chest'), 1300);
      if (this.onMessage) this.onMessage('Apareció un maletín con suministros', 'good');
    },

    // Desafío de la carrera completado (una vez por carrera: deja un arma gratis en el refugio)
    chal(id) {
      if (!this.retorno || !G.Run || !G.Run.active) return;
      const r = G.Run.challenge(id, player);
      if (!r) return;
      if (this.onMessage) this.onMessage('Desafío completado: ' + r.c.name + (r.gift ? ' · te espera un arma en el refugio' : ' · +60 monedas'), 'good');
      if (G.Audio) G.Audio.play('pickup');
    },

    // fin de la caza: los que quedan se van (un fundido a negro y ya no están)
    clearRest() {
      for (const z of st.list) {
        if (!z.alive) continue;
        if (player.struggle && player.struggle.z === z) player.struggle = null;
        if (player.beaten && player.beaten.z === z) player.beaten = null;
        const i = G.Population.list.indexOf(z);
        if (i >= 0) G.Population.list.splice(i, 1);
        z.dispose();
      }
      st.list = st.list.filter((z) => !z.alive || false);
    },

    // ---------- Cada fotograma ----------
    update(dt) {
      if (!this.active || !st || player.dead) return;
      const s = this.stats;
      if (st.phase !== 'stats') s.time += dt;
      if (st.titleT > 0) { st.titleT -= dt; if (st.titleT <= 0) $['m-title'].classList.add('out'); }
      st.hurtHp = player.health;
      // muertes nuevas (y lo que sueltan)
      for (const z of st.list) {
        if (z.alive || st.seen.has(z)) continue;
        st.seen.add(z);
        s.kills++;
        if (z.killedBy === 'gun') s.gunKills++;
        else s.melee++;
        if (z.killedBy === 'stealth' && !st.chal) {
          st.chal = true; this.renderChal();
          player.items.venda = Math.min(player.items.venda + 2, G.Weapons.SUPPLY.venda.cap[player.backpack ? 1 : 0]);
          if (this.onMessage) this.onMessage('Desafío completado: +2 vendas', 'good');
        }
        // desafíos de la carrera
        if (z.blind && z.killedBy === 'stealth') this.chal('sigilo_chasq');
        if (z.temb && z.killedBy === 'fire' && z.burnSrc === 'molotov') this.chal('molotov_temb');
        if (z.killedBy === 'exec') st.execN = (st.execN || 0) + 1;
        if (s.head >= 5) this.chal('cabezas');
        if (Math.max(s.exec, st.execN || 0) >= 3) this.chal('remates');
        if (st.type === 'caza' && s.kills >= 15) this.chal('cazador');
        const k = z.temb ? 'temb' : z.blind ? 'blind' : z.stalker ? 'stalker' : 'runner';
        if (G.Pickups.drop) G.Pickups.drop(z, player, DROP[k], k === 'temb' ? 2 : 1);
        st.corpses.push(z);
        if (z.killedBy !== 'exec' && z.killedBy !== 'stealth') this.bark('kill');
      }
      // los cadáveres más viejos se hunden y desaparecen (rendimiento)
      while (st.corpses.length > MAX_CORPSES) {
        const z = st.corpses[0];
        if (z.fall < 1) break;
        z.sink = (z.sink || 0) + dt * 0.35;
        z.lift = -z.sink;
        if (z.sink > 0.45) {
          st.corpses.shift();
          const i = G.Population.list.indexOf(z);
          if (i >= 0) G.Population.list.splice(i, 1);
          const j = st.list.indexOf(z);
          if (j >= 0) st.list.splice(j, 1);
          z.dispose();
        } else break;
      }
      // chasqueadores: se acercan a donde estás aunque no hagas ruido (a tientas)
      st.blindT -= dt;
      if (st.blindT <= 0) {
        st.blindT = 4;
        for (const z of st.list) {
          if (!z.alive || !z.blind || !(z.state === 'idle' || z.state === 'wander')) continue;
          z.target = { x: player.pos.x + (Math.random() - 0.5) * 7, z: player.pos.z + (Math.random() - 0.5) * 7, lv: player.lv || 0 };
          z.enter('investigate', 9);
        }
      }

      switch (st.phase) {
        case 'prep':
          st.t -= dt;
          this.setTimer(st.type === 'caza' ? 'LOS INFECTADOS SE ACERCAN' : 'OLEADA ENTRANTE', st.t);
          if (st.t <= 0) {
            if (st.type === 'caza') { st.phase = 'hunt'; st.left = st.total; st.spawnT = 0.5; this.fighting = true; $['m-title'].classList.add('out'); this.bark('wave'); if (this.onMessage) this.onMessage('¡Aguanta hasta el regreso!', 'bad'); }
            else this.beginWave(1);
          }
          break;
        case 'wave': {
          st.spawnT -= dt;
          const alive = st.list.filter((z) => z.alive).length;
          if (st.queue.length && st.spawnT <= 0 && alive < st.alive) {
            if (this.spawnOne(st.queue[0])) st.queue.shift();
            st.spawnT = 0.9 + Math.random() * 1.2;
          }
          this.renderWave();
          const left = st.queue.length + alive;
          if (left === 1 && !st.lastSaid) { st.lastSaid = true; this.bark('last'); }
          if (left === 0) {
            st.lastSaid = false;
            this.fighting = false;
            $['m-wave'].classList.add('hidden');
            if (this.stats.hurt <= st.waveHurt && player.health >= st.waveHp - 0.01) this.chal('intacta');
            if (st.wave >= 2) this.spawnCase();
            if (st.wave < 3) {
              st.phase = 'between'; st.t = BETWEEN;
              setTimeout(() => this.bark('clear'), 600);
              if (this.onMessage) this.onMessage('Oleada superada', 'good');
            } else {
              st.phase = 'complete'; st.t = BANNER;
              this.banner('ENFRENTAMIENTO COMPLETADO', BANNER);
              setTimeout(() => this.bark('done'), 900);
            }
          }
          break;
        }
        case 'between':
          st.t -= dt;
          this.setTimer('PRÓXIMA OLEADA EN…', st.t);
          if (st.t <= 0) this.beginWave(st.wave + 1);
          break;
        case 'hunt': {
          // caza: llegan sin parar, cada vez más seguido (como mucho 12 a la vez)
          st.left -= dt;
          const prog = 1 - Math.max(0, st.left) / st.total;
          this.setTimer('REGRESO AL REFUGIO EN', Math.max(0, st.left));
          st.spawnT -= dt;
          const alive = st.list.filter((z) => z.alive).length;
          if (st.spawnT <= 0 && alive < CAZA_MAX) {
            if (this.spawnOne({ kind: cazaKind() })) st.cazaN++;
            // los tres primeros llegan seguidos; luego, de 8 s a 2 s entre uno y otro
            st.spawnT = st.cazaN < 3 ? 1.2 + Math.random() : U.lerp(8, 2, Math.pow(prog, 1.2)) * (0.75 + Math.random() * 0.5);
          }
          if (st.left < 20 && !st.hurrySaid) { st.hurrySaid = true; this.bark('hurry'); }
          if (st.left <= 0) {
            st.phase = 'fade'; st.t = 0.55;
            this.fighting = false;
            this.setTimer(null);
            if (this.onFade) this.onFade(1, 0.5);
          }
          break;
        }
        case 'fade':
          st.t -= dt;
          if (st.t <= 0 && !st.cleared) {
            st.cleared = true;
            this.clearRest();
            if (this.onFade) this.onFade(0, 0.7);
            st.phase = 'complete'; st.t = BANNER;
            this.banner('ENFRENTAMIENTO COMPLETADO', BANNER);
            setTimeout(() => this.bark('done'), 900);
          }
          break;
        case 'complete':
          st.t -= dt;
          if (st.t <= 0) { st.phase = 'return'; st.t = RETURN; }
          break;
        case 'return':
          st.t -= dt;
          this.setTimer('REGRESANDO AL REFUGIO', st.t);
          if (st.t <= 0) { st.phase = 'stats'; this.setTimer(null); this.showStats(true); }
          break;
      }
    },

    // ---------- Puntuación ----------
    score(win) {
      const s = this.stats;
      const acc = s.shots ? s.hits / s.shots : 0;
      const caza = st && st.type === 'caza';
      const rows = [
        ['RENDIMIENTO', '', ''],
        caza ? ['Supervivencia', win ? 'completa' : fmtTime(st.total - Math.max(0, st.left)), win ? 100 : 0]
          : ['Finalización del enfrentamiento', win ? '' : 'oleada ' + (st ? st.wave : 0) + '/3', win ? 100 : 0],
        caza ? ['Infectados eliminados', s.kills, Math.min(100, s.kills * 6)]
          : ['Finalización por tiempo', fmtTime(s.time), win ? Math.max(0, Math.round(100 - Math.max(0, s.time - 240) / 6)) : 0],
        ['Daño recibido', Math.round(s.hurt), Math.max(0, Math.round(100 - s.hurt * 0.6))],
        ['Precisión', s.shots ? Math.round(acc * 100) + ' %' : '—', Math.round(acc * 100)],
        ['BONIFICACIÓN', '', ''],
        ['Aturdir', s.stun, s.stun * 5],
        ['Muertes cuerpo a cuerpo', s.melee, s.melee * 5],
        ['Remates', s.exec, s.exec * 5],
        ['Disparos a la cabeza', s.head, s.head * 5],
        ['Forcejeos ganados', s.escapes, s.escapes * 5],
        ['Desafío: matar por sorpresa', st && st.chal ? 1 : 0, st && st.chal ? 20 : 0]
      ];
      let total = 0;
      for (const r of rows) if (typeof r[2] === 'number') total += r[2];
      return { rows, total };
    },

    showStats(win) {
      const { rows, total } = this.score(win);
      let h = '';
      for (const r of rows) {
        if (r[2] === '') h += '<div class="ms-sec"><span>' + r[0] + '</span><span>ESTADÍSTICAS</span><span>PUNTAJE</span></div>';
        else h += '<div class="ms-row"><span>' + r[0] + '</span><span>' + r[1] + '</span><span>' + r[2] + '</span></div>';
      }
      $['m-rows'].innerHTML = h;
      $['m-total'].textContent = total;
      el('m-stitle').textContent = win ? 'ENFRENTAMIENTO COMPLETADO' : 'ENFRENTAMIENTO FALLIDO';
      const mm = document.querySelector('#m-stats .ms-mode');
      if (mm) mm.textContent = 'CAMPO DE PRUEBAS · ' + (st && st.type === 'caza' ? 'CAZA' : 'ASALTO');
      $['m-stats'].classList.remove('hidden');
      $['mode-hud'].classList.add('hidden');
      if (this.onFinish) this.onFinish(win, total);
    },

    // para la pantalla de muerte
    summary() {
      if (!this.active || !st) return '';
      return (st.type === 'caza' ? 'Caza · ' + fmtTime(st.total - Math.max(0, st.left)) + ' de ' + fmtTime(st.total) : 'Asalto · oleada ' + st.wave + '/3') +
        ' · Infectados eliminados: ' + this.stats.kills;
    },
    get phase() { return st ? st.phase : null; },
    get type() { return st ? st.type : null; },
    skip() { if (st) { st.t = 0; st.spawnT = 0; if (st.phase === 'hunt') st.left = Math.min(st.left, 0.01); } },   // para pruebas
    get wave() { return st ? st.wave : 0; },
    get list() { return st ? st.list : []; },
    waveQueue
  };

  function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ' min ' + (s < 10 ? '0' : '') + s + ' s'; }

  G.Mode = Mode;
})(window.Game = window.Game || {});
