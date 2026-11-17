(() => {
  'use strict';

  const levels = window.K15_LEVELS;
  const storageKey = 'k15-photo-search-v1';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const byId = (id) => document.getElementById(id);
  const world = byId('scene-world');
  const scroll = byId('scene-scroll');
  const layer = byId('target-layer');
  const cover = byId('scene-cover');
  const hintButton = byId('hint');
  const zoomButton = byId('zoom');
  const tabs = [...document.querySelectorAll('[data-studio]')];
  const doorForm = byId('door-form');
  const doorCode = byId('door-code');
  let doorUnlocked = false;
  let current = 0;
  let ready = false;
  let playing = false;
  let scene;
  let game;
  let progress = readProgress();

  function readProgress() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch { /* Storage is optional. */ }
    const storedLevels = Array.isArray(saved) ? saved : saved?.levels;
    const restored = levels.map((level, index) => ({
      found: level.objects.filter((object) => Array.isArray(storedLevels?.[index]?.found) && storedLevels[index].found.includes(object.id)).map((object) => object.id),
      hints: Number.isInteger(storedLevels?.[index]?.hints) ? Math.min(3, Math.max(0, storedLevels[index].hints)) : 0,
    }));
    doorUnlocked = saved?.doorUnlocked === true && restored[0].found.length === 5;
    return restored;
  }

  function saveProgress() {
    try { localStorage.setItem(storageKey, JSON.stringify({ levels: progress, doorUnlocked })); } catch { /* Play also works in private mode. */ }
  }

  function message(text) { byId('game-message').textContent = text; }

  function setCover(title, text, action, mode) {
    playing = false;
    cover.hidden = false;
    doorForm.hidden = true;
    cover.closest('.scene-column').classList.remove('door-mode');
    byId('cover-action').hidden = false;
    byId('cover-title').textContent = title;
    byId('cover-text').textContent = text;
    byId('cover-action').textContent = action;
    byId('cover-action').dataset.mode = mode;
    byId('cover-action').disabled = !ready;
    layer.inert = true;
    hintButton.disabled = true;
    zoomButton.disabled = true;
  }

  function updateProgress() {
    const found = progress[current].found;
    byId('level-count').textContent = `${found.length} / 5`;
    const total = progress.reduce((sum, state) => sum + state.found.length, 0);
    byId('total-count').textContent = `${total} / 10`;
    byId('total-count').setAttribute('aria-label', `Знайдено ${total} із 10 предметів`);
    hintButton.textContent = `Підказка · ${3 - progress[current].hints}`;
    hintButton.disabled = !playing || progress[current].hints >= 3;
    tabs.forEach((tab, index) => {
      tab.setAttribute('aria-pressed', String(current === index));
      const locked = index === 1 && !doorUnlocked;
      tab.setAttribute('aria-disabled', String(locked));
      tab.textContent = locked ? 'SAKURA · зачинено' : levels[index].name + (progress[index].found.length === 5 ? ' ✓' : '');
    });
    byId('door-button').hidden = current !== 0;
    byId('door-button').disabled = !ready || progress[0].found.length < 5;
    byId('door-button').textContent = doorUnlocked ? 'Увійти до SAKURA →' : 'Двері до SAKURA · ' + progress[0].found.length + ' / 5 підказок';
    byId('clue-journal').hidden = current !== 0;
    byId('clue-list').replaceChildren();
    for (const object of levels[0].objects) {
      if (!progress[0].found.includes(object.id)) continue;
      const entry = document.createElement('li');
      entry.textContent = object.clue;
      byId('clue-list').append(entry);
    }
    levels[current].objects.forEach((object) => {
      const isFound = found.includes(object.id);
      const card = byId(`card-${object.id}`);
      card.classList.toggle('is-found', isFound);
      card.querySelector('.object-check').textContent = isFound ? '✓' : '';
      card.setAttribute('aria-label', `${object.name}${isFound ? ' — знайдено' : ' — потрібно знайти'}`);
      byId(`target-${object.id}`).disabled = isFound;
    });
  }

  function buildObjects() {
    const level = levels[current];
    layer.replaceChildren();
    byId('object-list').replaceChildren();
    for (const object of level.objects) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `target-${object.id}`;
      button.className = 'photo-target';
      button.setAttribute('aria-label', `Позначити предмет «${object.name}»`);
      button.style.left = `${object.x / level.width * 100}%`;
      button.style.top = `${object.y / level.height * 100}%`;
      button.style.width = `${object.w / level.width * 100}%`;
      button.style.height = `${object.h / level.height * 100}%`;
      button.addEventListener('click', (event) => {
        // Keyboard activation uses the same discovery path as a photo tap.
        if (event.detail === 0) { event.stopPropagation(); findObject(object); }
      });
      button.addEventListener('focus', () => button.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
      layer.append(button);

      const card = document.createElement('li');
      card.id = `card-${object.id}`;
      card.className = 'object-card';
      const thumbnail = document.createElement('span');
      thumbnail.className = 'object-thumbnail';
      thumbnail.setAttribute('aria-hidden', 'true');
      // Display a crop of the original photo as a visual search reference.
      const cropScale = 40 / Math.max(object.w, object.h);
      thumbnail.style.backgroundImage = `url("${level.image}")`;
      thumbnail.style.backgroundSize = `${level.width * cropScale}px ${level.height * cropScale}px`;
      thumbnail.style.backgroundPosition = `calc(50% + ${(level.width / 2 - object.x) * cropScale}px) calc(50% + ${(level.height / 2 - object.y) * cropScale}px)`;
      const name = document.createElement('span');
      name.className = 'object-name';
      name.textContent = object.name;
      const check = document.createElement('span');
      check.className = 'object-check';
      check.setAttribute('aria-hidden', 'true');
      card.append(thumbnail, name, check);
      byId('object-list').append(card);
    }
  }

  function loadLevel(index) {
    if (index === 1 && !doorUnlocked) {
      message('SAKURA зачинена. Знайдіть 5 підказок в AURA та розгадайте код на дверях.');
      return;
    }
    current = index;
    playing = false;
    scroll.classList.remove('is-zoomed');
    zoomButton.setAttribute('aria-pressed', 'false');
    zoomButton.textContent = 'Збільшити +';
    const level = levels[current];
    world.style.setProperty('--scene-ratio', level.width / level.height);
    byId('phaser-stage').setAttribute('aria-label', level.description);
    buildObjects();
    game.scale.resize(level.width, level.height);
    scene.showRoom(level);
    scroll.scrollTo(0, 0);
    updateProgress();
    message('Торкніться предмета на фотографії, коли знайдете його.');
    if (progress[current].found.length === 5) {
      showCompletion(false);
    } else {
      setCover(`Роздивіться ${level.name}`, current === 0 ? 'Знайдіть 5 деталей на фото. Кожна відкриє підказку до кодового замка на дверях у SAKURA.' : 'Двері відчинено! Знайдіть останні 5 деталей у SAKURA, щоб завершити квест.', progress[current].found.length ? 'Продовжити пошук' : 'Почати пошук', 'play');
    }
  }

  function startPlaying() {
    cover.hidden = true;
    layer.inert = false;
    playing = true;
    zoomButton.disabled = false;
    updateProgress();
    scroll.focus({ preventScroll: true });
  }

  function findObject(object) {
    const state = progress[current];
    if (!playing || state.found.includes(object.id)) return;
    state.found.push(object.id);
    saveProgress();
    scene.markObject(object, true);
    message(object.clue || `Знайдено — ${object.name.toLocaleLowerCase('uk')}. ${state.found.length} із 5!`);
    updateProgress();
    if (state.found.length === 5) showCompletion(true);
  }

  function showCompletion(moveFocus) {
    if (current === 0 && !doorUnlocked) {
      showDoor(moveFocus);
      return;
    }
    const complete = progress.every((state) => state.found.length === 5);
    if (complete) {
      setCover('Усі деталі знайдено!', 'Ви роздивилися обидві студії та зібрали 10 із 10 деталей. До зустрічі у K15.Space!', 'Зіграти ще раз', 'replay');
    } else {
      setCover(`${levels[current].name} — готово!`, 'Усі 5 деталей знайдено. Ще одна студія чекає на ваш уважний погляд.', `До ${levels[1 - current].name} →`, 'next');
    }
    updateProgress();
    if (moveFocus) byId('cover-action').focus({ preventScroll: true });
  }

  function showDoor(moveFocus) {
    if (!ready || current !== 0 || progress[0].found.length !== 5 || doorUnlocked) return;
    setCover('Двері до SAKURA', 'Напис на замку підказує порядок цифр. Ваза → олівці → листок → листівка.', '', 'door');
    cover.closest('.scene-column').classList.add('door-mode');
    doorForm.hidden = false;
    byId('cover-action').hidden = true;
    doorCode.value = '';
    doorCode.removeAttribute('aria-invalid');
    byId('door-feedback').textContent = 'Складіть код із зібраних цифр. Кількість спроб необмежена.';
    byId('door-clues').textContent = levels[0].objects.filter(object => object.digit !== undefined)
      .map(object => object.name + ' — ' + object.digit).join(' · ');
    updateProgress();
    if (moveFocus) doorCode.focus({ preventScroll: true });
  }

  function showHint() {
    if (!playing || progress[current].hints >= 3) return;
    const object = levels[current].objects.find((item) => !progress[current].found.includes(item.id));
    if (!object) return;
    progress[current].hints++;
    saveProgress();
    const target = byId(`target-${object.id}`);
    // Scroll only the photo viewport, keeping the page and controls in place.
    scroll.scrollTo({ left: target.offsetLeft - scroll.clientWidth / 2, top: target.offsetTop - scroll.clientHeight / 2, behavior: reducedMotion ? 'instant' : 'smooth' });
    scene.hintObject(object);
    message(`Придивіться до підсвіченої ділянки — ${object.name.toLocaleLowerCase('uk')}.`);
    updateProgress();
  }

  function resetGame() {
    doorUnlocked = false;
    progress = levels.map(() => ({ found: [], hints: 0 }));
    saveProgress();
    loadLevel(0);
    byId('cover-action').focus({ preventScroll: true });
  }

  function failGame() {
    ready = false;
    playing = false;
    setCover('Гра не завантажилася', 'Перевірте з’єднання та спробуйте відкрити гру ще раз. Збережений прогрес залишиться у браузері.', 'Спробувати ще раз', 'reload');
    byId('cover-action').disabled = false;
    tabs.forEach((tab) => { tab.disabled = true; });
    byId('restart').disabled = true;
    byId('door-button').disabled = true;
  }

  byId('cover-action').addEventListener('click', (event) => {
    const mode = event.currentTarget.dataset.mode;
    if (mode === 'reload') { window.location.reload(); return; }
    if (!ready) return;
    if (mode === 'play') startPlaying();
    if (mode === 'next') {
      loadLevel(1 - current);
      if (progress[current].found.length < 5) startPlaying();
    }
    if (mode === 'replay') resetGame();
  });
  tabs.forEach((tab, index) => tab.addEventListener('click', () => { if (ready) loadLevel(index); }));
  hintButton.addEventListener('click', showHint);
  byId('door-button').addEventListener('click', () => {
    if (!ready || progress[0].found.length !== 5) return;
    if (doorUnlocked) {
      loadLevel(1);
      if (progress[1].found.length < 5) startPlaying();
    } else showDoor(true);
  });
  doorCode.addEventListener('input', () => {
    doorCode.value = doorCode.value.replace(/[^0-9]/g, '').slice(0, 4);
    doorCode.removeAttribute('aria-invalid');
  });
  doorForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!ready || current !== 0 || progress[0].found.length !== 5 || doorUnlocked) return;
    const code = window.K15_DOOR_ORDER.map(id => levels[0].objects.find(object => object.id === id).digit).join('');
    if (doorCode.value !== code) {
      doorCode.setAttribute('aria-invalid', 'true');
      byId('door-feedback').textContent = doorCode.value.length !== 4
        ? 'Введіть усі чотири цифри, включно з нулем.'
        : 'Замок не відкрився. Перевірте порядок — ваза, олівці, листок, листівка.';
      doorCode.focus({ preventScroll: true });
      doorCode.select();
      return;
    }
    doorUnlocked = true;
    saveProgress();
    setCover('Двері відчинено!', 'Код підійшов. За дверима чекає SAKURA та ще п’ять деталей для пошуку.', 'Увійти до SAKURA →', 'next');
    updateProgress();
    byId('cover-action').focus({ preventScroll: true });
  });
  zoomButton.addEventListener('click', () => {
    const centerX = (scroll.scrollLeft + scroll.clientWidth / 2) / world.clientWidth;
    const centerY = (scroll.scrollTop + scroll.clientHeight / 2) / world.clientHeight;
    const zoomed = scroll.classList.toggle('is-zoomed');
    zoomButton.setAttribute('aria-pressed', String(zoomed));
    zoomButton.textContent = zoomed ? 'Зменшити −' : 'Збільшити +';
    scroll.scrollTo(centerX * world.clientWidth - scroll.clientWidth / 2, centerY * world.clientHeight - scroll.clientHeight / 2);
  });
  byId('restart').addEventListener('click', () => {
    if (window.confirm('Почати обидва рівні заново? Знайдені предмети та підказки буде скинуто.')) resetGame();
  });

  let pointerStart;
  world.addEventListener('pointerdown', (event) => {
    pointerStart = { x: event.clientX, y: event.clientY, left: scroll.scrollLeft, top: scroll.scrollTop };
  });
  world.addEventListener('pointercancel', () => { pointerStart = null; });
  world.addEventListener('click', (event) => {
    if (!playing || event.detail === 0 || !pointerStart) return;
    const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    const scrolled = Math.abs(scroll.scrollLeft - pointerStart.left) + Math.abs(scroll.scrollTop - pointerStart.top);
    pointerStart = null;
    if (moved > 12 || scrolled > 12) return;
    const level = levels[current];
    const bounds = world.getBoundingClientRect();
    const scale = bounds.width / level.width;
    const x = (event.clientX - bounds.left) / scale;
    const y = (event.clientY - bounds.top) / scale;
    // Resolve overlapping finger-sized hit areas by proximity to the real object.
    const candidates = level.objects
      .filter((object) => Math.abs(x - object.x) <= Math.max(object.w / 2 + 8, 22 / scale) && Math.abs(y - object.y) <= Math.max(object.h / 2 + 8, 22 / scale))
      .sort((a, b) => Math.hypot(x - a.x, y - a.y) - Math.hypot(x - b.x, y - b.y));
    if (candidates.length) findObject(candidates[0]);
    else message('Придивіться ще. Зразки потрібних деталей є у списку.');
  });

  if (!window.Phaser) { failGame(); return; }

  class StudioScene extends Phaser.Scene {
    preload() {
      this.load.on('loaderror', failGame);
      levels.forEach((level) => this.load.image(level.id, level.image));
    }

    create() {
      if (levels.some((level) => !this.textures.exists(level.id))) return;
      scene = this;
      ready = true;
      tabs.forEach((tab) => { tab.disabled = false; });
      byId('restart').disabled = false;
      loadLevel(current);
      this.game.canvas.setAttribute('aria-hidden', 'true');
    }

    showRoom(level) {
      this.tweens.killAll();
      this.children.removeAll(true);
      this.add.image(0, 0, level.id).setOrigin(0);
      for (const object of level.objects) {
        if (progress[current].found.includes(object.id)) this.markObject(object, false);
      }
    }

    markObject(object, animate) {
      const radius = Math.max(object.w, object.h) / 2 + 9;
      const ring = this.add.circle(object.x, object.y, radius, 0xf7f0de, .13).setStrokeStyle(4, 0xf7f0de);
      this.add.circle(object.x, object.y, radius + 4).setStrokeStyle(3, 0x4a1c0d);
      if (animate && !reducedMotion) this.tweens.add({ targets: ring, alpha: .35, duration: 230, yoyo: true, repeat: 2 });
    }

    hintObject(object) {
      const ring = this.add.circle(object.x, object.y, Math.max(object.w, object.h) / 2 + 23, 0xf7f0de, .3).setStrokeStyle(5, 0xc94769);
      this.tweens.add({ targets: ring, alpha: 0, duration: reducedMotion ? 5000 : 750, yoyo: !reducedMotion, repeat: reducedMotion ? 0 : 3, onComplete: () => ring.destroy() });
    }
  }

  game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: 'phaser-stage',
    width: levels[0].width,
    height: levels[0].height,
    backgroundColor: '#f7f0de',
    banner: false,
    audio: { noAudio: true },
    input: { mouse: false, touch: false, keyboard: false, gamepad: false },
    scale: { mode: Phaser.Scale.NONE },
    fps: { target: 30 },
    scene: StudioScene,
  });
})();
