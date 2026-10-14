import { CONFIG, ROOM_NAMES, LAYOUT_NAMES } from './config.mjs';
import { kyivToday, minutes, clock, intervalError, eligibleRooms, alternatives, calculateQuote, includesSakura, guestBounds, previewStudio } from './logic.mjs';
import { fetchDemoAvailability } from './calendar.mjs';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const money = value => new Intl.NumberFormat('uk-UA').format(value);
const priceRange = (min, max = min) => max > min ? `${money(min)}–${money(max)}` : money(min);
const initial = () => ({ date: kyivToday(), startTime: '08:00', duration: 180,
  guests: 10, guestRange: '6:10', layout: 'one', equipment: 'no', laptop: 'own', room: null,
  tableware: false, food: false, foodTables: 1, tablecloth: 'own', banner: false, carpet: false, decor: false });
let state = initial(), step = 0, furthest = 0, availability = null, status = 'idle';
let controller, requestId = 0, previewRoom = 'aura';
let calendarPreviewRoom = 'aura';
const app = $('#booking-app'), form = $('#wizard-form');
app.hidden = false;
$('#date').min = kyivToday();
for (let start = CONFIG.opens; start < CONFIG.closes; start += CONFIG.increment) {
  const option = document.createElement('option'); option.value = clock(start); option.textContent = clock(start);
  $('#start-time').append(option);
}

function writeInputs() {
  $('#date').value = state.date; $('#start-time').value = state.startTime;
  $('#custom-duration').value = state.duration / 60;
  const preset = [120, 180, 300].includes(state.duration) ? String(state.duration) : 'custom';
  form.elements.durationChoice.value = preset;
  for (const name of ['layout', 'equipment', 'laptop', 'tablecloth']) form.elements[name].value = state[name];
  for (const name of ['tableware', 'food', 'banner', 'carpet', 'decor']) form.elements[name].checked = state[name];
  $('#food-tables').value = state.foodTables;
  $('#calendar-error').checked = false;
}

function candidates() { return status === 'ready' ? eligibleRooms(state, availability) : []; }

function guestError() {
  if (!Number.isInteger(state.guests) || state.guests < 1 || state.guests > CONFIG.capacity.maximum)
    return 'Оберіть орієнтовну кількість гостей.';
  if (state.layout === 'one' && state.guests > CONFIG.capacity.sakuraOneTable)
    return 'Для верхньої межі цього діапазону оберіть два столи, фуршет або посадку без столів. Один стіл у прототипі — до 14 гостей.';
  return '';
}

function stepError(index) {
  const interval = intervalError(state);
  if (interval) return interval;
  if (status !== 'ready') return status === 'loading' ? 'Дочекайтеся перевірки календаря.' : 'Повторіть перевірку тестового календаря.';
  if (!availability.aura && !availability.sakura) return 'На цей час обидві студії зайняті. Оберіть інший інтервал.';
  if (index >= 1) {
    const guest = guestError(); if (guest) return guest;
    const rooms = index === 1 ? eligibleRooms({ ...state, equipment: 'no' }, availability) : candidates();
    if (!rooms.length) return 'Немає сумісної студії на весь обраний час. Змініть час або умови події.';
  }
  if (index >= 3 && !candidates().includes(state.room)) return 'Оберіть студію.';
  if (index >= 4 && state.food && (!Number.isInteger(state.foodTables) || state.foodTables < 1 || state.foodTables > 4))
    return 'Для тестового розрахунку вкажіть від 1 до 4 столів для їжі та напоїв.';
  return '';
}

function invalidateRoom() {
  if (state.room && !candidates().includes(state.room)) {
    state.room = null;
    $('#selection-message').textContent = 'Попередній вибір студії скинуто: змінилися умови. Перевірте сумісні варіанти.';
    furthest = Math.min(furthest, 3);
  }
}

async function checkCalendar() {
  controller?.abort(); controller = new AbortController();
  const id = ++requestId;
  availability = null; status = 'idle'; invalidateRoom();
  const error = intervalError(state);
  if (error) { status = 'invalid'; render(); return; }
  status = 'loading'; render();
  try {
    const response = await fetchDemoAvailability(state, { signal: controller.signal, simulateError: $('#calendar-error').checked });
    if (id !== requestId) return;
    availability = response.rooms; status = 'ready'; render();
  } catch (error) {
    if (error.name === 'AbortError' || id !== requestId) return;
    status = 'error'; availability = null; render();
  }
}

function alternativeButtons(target, requirements, answers = state) {
  target.replaceChildren();
  for (const alternative of alternatives(answers, requirements)) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.useTime = alternative.time;
    button.textContent = `${alternative.time}–${clock(minutes(alternative.time) + answers.duration)} · ${alternative.rooms.map(room => ROOM_NAMES[room]).join(' / ')}`;
    target.append(button);
  }
}

function renderAvailability() {
  const node = $('#availability-status');
  node.dataset.status = status;
  node.replaceChildren();
  const text = document.createElement('p');
  if (status === 'loading') text.textContent = 'Перевіряємо весь інтервал у тестовому календарі…';
  else if (status === 'invalid') text.textContent = intervalError(state);
  else if (status === 'error') text.textContent = 'Не вдалося перевірити календар. Доступність невідома — спробуйте ще раз.';
  else if (status === 'ready') {
    const rooms = Object.keys(availability).filter(room => availability[room]);
    text.textContent = rooms.length ? `Тестовий календар: вільно ${rooms.map(room => ROOM_NAMES[room]).join(' та ')} на весь час.`
      : 'Обидві студії зайняті на частину цього інтервалу. Спробуйте інший час:';
    if (!rooms.length) node.dataset.status = 'empty';
  }
  node.append(text);
  if (status === 'error') {
    const retry = document.createElement('button'); retry.type = 'button'; retry.id = 'retry-calendar'; retry.className = 'text-button'; retry.textContent = 'Повторити перевірку'; node.append(retry);
  }
  $('#date-alternatives').replaceChildren();
  if (status === 'ready' && !availability.aura && !availability.sakura) alternativeButtons($('#date-alternatives'), false);
}

function roomExplanation(rooms) {
  if (rooms[0] === 'both') return `За тестовим правилом від 20 гостей потрібні обидві студії. Вони мають бути вільні одночасно.${state.layout === 'two' ? ' Два столи розміщуються у SAKURA; у AURA можна поставити лише один стіл.' : ''}`;
  if (rooms.length > 1) return 'Обидві студії підходять. Оберіть ту, що ближча до вашої ідеї.';
  const reasons = [];
  if (state.equipment === 'yes') reasons.push('проєктор і караоке доступні лише у SAKURA');
  if (state.layout === 'two') reasons.push('два столи можна поставити лише у SAKURA');
  if (state.guests > CONFIG.capacity.aura) reasons.push('верхня межа кількості гостей потребує SAKURA за тестовими правилами');
  if (!availability?.aura) reasons.push('AURA зайнята в тестовому календарі');
  if (!availability?.sakura) reasons.push('SAKURA зайнята в тестовому календарі');
  return rooms.length ? `Підходить ${ROOM_NAMES[rooms[0]]}: ${reasons.join('; ')}.` : 'Сумісних варіантів немає. Поверніться до часу або умов події.';
}

function renderRooms(rooms) {
  const target = $('#room-options'); target.replaceChildren();
  for (const room of rooms) {
    const label = document.createElement('label'); label.className = 'choice room-choice';
    const image = document.createElement('img'); image.src = `/images/booking/${room === 'both' ? 'sakura' : room}-base.jpg`;
    image.alt = room === 'both' ? 'Приклад розстановки у SAKURA; обрано оренду обох студій' : `Студія ${ROOM_NAMES[room]} — фото з форми`;
    const span = document.createElement('span'), input = document.createElement('input'); input.type = 'radio'; input.name = 'room'; input.value = room; input.checked = state.room === room;
    const copy = document.createElement('span'), title = document.createElement('strong'), detail = document.createElement('small');
    title.textContent = ROOM_NAMES[room]; detail.textContent = `${money(CONFIG.rates.hourly * (room === 'both' ? 2 : 1))} грн/год · ${room === 'both' ? 'дві студії разом' : room === 'aura' ? '26 м²' : '31 м²'}`;
    copy.append(title, detail); span.append(input, copy); label.append(image, span); target.append(label);
  }
  $('#room-reason').textContent = roomExplanation(rooms);
}

function quoteRows(target, quote) {
  target.replaceChildren();
  if (!quote.items.length) {
    const empty = document.createElement('p'); empty.className = 'field-note'; empty.textContent = 'Оберіть час і студію — тут з’явиться вартість.'; target.append(empty);
  }
  for (const item of quote.items) {
    const row = document.createElement('div'); row.className = 'quote-row'; row.dataset.quote = item.key;
    const label = document.createElement('span'), price = document.createElement('span'); label.textContent = item.label; price.textContent = `${priceRange(item.amount, item.amountMax)} грн`;
    row.append(label, price); target.append(row);
  }
}

function consultationRows(target, quote) {
  target.replaceChildren();
  for (const text of quote.consultations) { const p = document.createElement('p'); p.className = 'consultation-line'; p.textContent = text; target.append(p); }
}

function renderPreview(quote) {
  const calendarRooms = status === 'ready' ? Object.keys(availability).filter(room => availability[room]) : [];
  const calendarPreview = step === 1 && calendarRooms.length > 0;
  if (!calendarRooms.includes(calendarPreviewRoom) && calendarRooms.length) calendarPreviewRoom = calendarRooms[0];
  const room = calendarPreview ? calendarPreviewRoom : previewStudio(state, calendarRooms, previewRoom);
  $('#studio-carousel').hidden = !(calendarPreview && calendarRooms.length > 1);
  $('#carousel-status').textContent = `${ROOM_NAMES[room]} · ${calendarRooms.indexOf(room) + 1} / ${calendarRooms.length}`;
  const scene = $('#room-preview'); scene.dataset.room = room;
  $('#scene-base').src = `/images/booking/${room}-base.jpg`;
  $('#scene-base').alt = `Студія ${ROOM_NAMES[room]} — фото з форми K15.Space; ілюстративний вигляд`;
  $('#scene-base').width = 260; $('#scene-base').height = room === 'aura' ? 347 : 195;
  $('#dishes-layer').src = `/images/booking/${room}-tableware.png`;
  $('#dishes-layer').hidden = !state.tableware;
  $('#cloth-layer').hidden = !state.food || !['fabric', 'disposable'].includes(state.tablecloth);
  $('#cloth-layer').dataset.type = state.tablecloth;
  $('#projection-layer').hidden = !(state.equipment === 'yes' && room === 'sakura');
  $('#laptop-layer').hidden = !(state.equipment === 'yes' && state.laptop === 'rental' && room === 'sakura');
  $('#banner-layer').hidden = !(state.banner && includesSakura(state.room) && room === 'sakura');
  $('#carpet-layer').hidden = !(state.carpet && includesSakura(state.room) && room === 'sakura');
  $('#preview-room-name').textContent = calendarPreview || state.room ? ROOM_NAMES[room] : `Приклад ${ROOM_NAMES[room]}`;
  $('#preview-tabs').hidden = calendarPreview || state.room !== 'both';
  $$('[data-preview]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preview === room)));
  $('#preview-caption').textContent = calendarPreview
    ? `Фото ${ROOM_NAMES[room]}. ${calendarRooms.length > 1 ? 'Обидві студії вільні за тестовим календарем. Перегляньте їх стрілками.' : 'Ця студія вільна за тестовим календарем.'} ${state.layout === 'two' ? 'Два столи можна поставити лише у SAKURA.' : 'У AURA можна поставити один стіл, у SAKURA — один або два.'} Перегляд фото не змінює вибір студії.`
    : `Ілюстрація для тестування. ${state.room ? 'Розстановка та кількість сервірувань умовні.' : 'Студія ще не обрана. Кількість сервірувань умовна.'} ${state.layout === 'two' ? 'Два столи — лише у SAKURA; у AURA можна поставити один стіл. ' : ''}${state.room === 'both' ? 'Показано одну з двох студій; проєктор — у SAKURA.' : ''}`;
  $('#preview-tags').replaceChildren();
  for (const item of quote.items.filter(item => item.key !== 'rent')) { const tag = document.createElement('span'); tag.textContent = item.label; $('#preview-tags').append(tag); }
}

function renderSummary(quote) {
  const dl = document.createElement('dl'); dl.className = 'summary-details';
  const date = new Intl.DateTimeFormat('uk-UA', { dateStyle: 'long', timeZone: CONFIG.timezone }).format(new Date(`${state.date}T12:00:00Z`));
  const pairs = [['Дата', date], ['Час (Київ)', `${state.startTime}–${clock(minutes(state.startTime) + state.duration)}`],
    ['Тривалість', `${state.duration / 60} год`], ['Гості (орієнтовно)', `До ${state.guests}`], ['Розстановка', LAYOUT_NAMES[state.layout]], ['Студія', ROOM_NAMES[state.room]]];
  for (const [key, value] of pairs) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = key; dd.textContent = value; dl.append(dt, dd); }
  $('#final-summary').replaceChildren(dl);
  const quoteBox = document.createElement('div'); quoteBox.className = 'final-quote'; quoteRows(quoteBox, quote);
  const total = document.createElement('div'); total.className = 'cart-total';
  const label = document.createElement('span'), amount = document.createElement('strong'); label.textContent = quote.consultations.length ? 'Відомі складові' : 'Орієнтовно разом'; amount.textContent = `${priceRange(quote.total, quote.totalMax)} грн`; total.append(label, amount); quoteBox.append(total);
  const consultation = document.createElement('div'); consultationRows(consultation, quote); quoteBox.append(consultation);
  $('#final-quote').replaceChildren(quoteBox);
}

function render() {
  const twoTablesAvailable = status === 'ready' && availability.sakura;
  const twoTableInput = $('input[name="layout"][value="two"]');
  twoTableInput.disabled = !twoTablesAvailable;
  twoTableInput.closest('.choice').setAttribute('aria-disabled', String(!twoTablesAvailable));
  $('#two-table-note').textContent = status === 'ready' && !availability.sakura
    ? 'Недоступно: SAKURA зайнята на цей час'
    : status === 'ready' ? 'Лише у SAKURA' : 'Потрібна перевірка календаря';
  if (status === 'ready' && !availability.sakura && state.layout === 'two') {
    state.layout = 'one'; form.elements.layout.value = 'one';
    $('#selection-message').textContent = 'Два столи недоступні: SAKURA зайнята на обраний час. Розстановку змінено на один стіл.';
  }
  invalidateRoom();
  const rooms = candidates();
  if (step >= 3 && rooms.length === 1 && !state.room) state.room = rooms[0];
  if (state.room === 'aura' && (state.banner || state.carpet)) {
    state.banner = false; state.carpet = false;
    $('#selection-message').textContent = 'Фотозону й доріжку прибрано з розрахунку: вони доступні лише у SAKURA.';
  }
  for (const name of ['banner', 'carpet']) {
    const input = $(`#${name}`);
    input.checked = state[name];
    input.disabled = !includesSakura(state.room);
    input.closest('.choice').hidden = !includesSakura(state.room);
  }
  $$('.wizard-panel').forEach(panel => { panel.hidden = Number(panel.dataset.panel) !== step; });
  $$('[data-step]').forEach(button => {
    const index = Number(button.dataset.step); button.disabled = index > furthest || index > step;
    if (index === step) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
  });
  $('#custom-duration-wrap').hidden = form.elements.durationChoice.value !== 'custom';
  $('#laptop-options').hidden = state.equipment !== 'yes';
  $('#food-options').hidden = !state.food;
  $('#interval-caption').textContent = intervalError(state) ? '' : `${state.startTime}–${clock(minutes(state.startTime) + state.duration)} · ${state.duration / 60} год · час Києва`;
  renderAvailability();
  const guestRooms = status === 'ready' ? eligibleRooms({ ...state, equipment: 'no' }, availability) : [];
  $('#guest-status').textContent = guestError() || (status === 'ready' && !guestRooms.length ? 'Для цих гостей і розстановки потрібна інша доступність. Оберіть інший час:' : '');
  $('#guest-alternatives').replaceChildren();
  if (status === 'ready' && !guestError() && !guestRooms.length) {
    alternativeButtons($('#guest-alternatives'), true, { ...state, equipment: 'no' });
  }
  const incompatible = status === 'ready' && !guestError() && !rooms.length;
  $('#equipment-status').textContent = incompatible ? 'На цей час немає студії, що відповідає вашим умовам. Спробуйте інший час нижче — відповіді збережуться.' : '';
  $('#equipment-alternatives').replaceChildren();
  if (incompatible) alternativeButtons($('#equipment-alternatives'), true);
  renderRooms(rooms);
  const quote = calculateQuote(state);
  quoteRows($('#cart-items'), quote); consultationRows($('#cart-consultations'), quote);
  $('#cart-total').textContent = state.room ? priceRange(quote.total, quote.totalMax) : '—';
  $('#total-label').textContent = !state.room ? 'Оберіть студію' : quote.consultations.length ? 'Відомі складові' : 'Попередньо';
  const guests = guestBounds(state);
  const tablewareMin = CONFIG.rates.tableware + Math.max(0, guests.min - 10) * CONFIG.rates.extraGuest;
  const tablewareMax = CONFIG.rates.tableware + Math.max(0, guests.max - 10) * CONFIG.rates.extraGuest;
  $('#tableware-price').textContent = `Орієнтовно ${priceRange(tablewareMin, tablewareMax)} грн · для ${guests.min}–${guests.max} гостей`;
  const ranges = $$('[data-guest-range]');
  ranges.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.guestRange === state.guestRange)));
  $('#guest-room-note').textContent = state.guests >= CONFIG.capacity.bothFrom
    ? `Для компанії до ${state.guests} гостей потрібно орендувати обидві студії — AURA та SAKURA одночасно. Вартість оренди — ${money(CONFIG.rates.hourly * 2)} грн/год. Обидві студії мають бути вільні на весь обраний час.`
    : state.guests > CONFIG.capacity.aura
      ? `Для компанії до ${state.guests} гостей потрібна студія SAKURA. Вартість оренди — ${money(CONFIG.rates.hourly)} грн/год.`
      : `Для компанії до ${state.guests} гостей достатньо однієї студії. Вибір залежить від доступності й розстановки.`;
  renderPreview(quote);
  if (step === 5) renderSummary(quote);
  $('#back').disabled = step === 0;
  $('#next').hidden = step === 5;
  $('#next').disabled = Boolean(stepError(step));
  $('#next').textContent = step === 4 ? 'Переглянути підсумок →' : 'Далі →';
}

function goTo(index) {
  step = index; $('#form-error').textContent = ''; render();
  $(`#title-${step}`).focus({ preventScroll: true });
  $('.wizard-card').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const error = stepError(step);
  if (error) { $('#form-error').textContent = error; return; }
  if (step < 5) { furthest = Math.max(furthest, step + 1); goTo(step + 1); }
});

function updateAnswer(event) {
  const input = event.target, name = input.name;
  $('#form-error').textContent = ''; $('#selection-message').textContent = '';
  if (name === 'date' || name === 'startTime') { state[name] = input.value; checkCalendar(); return; }
  if (name === 'durationChoice' || name === 'customDuration') {
    state.duration = form.elements.durationChoice.value === 'custom' ? Number($('#custom-duration').value) * 60 : Number(form.elements.durationChoice.value);
    checkCalendar(); return;
  }
  if (name === 'calendarError') { checkCalendar(); return; }
  if (name === 'foodTables') state[name] = input.value === '' ? NaN : Number(input.value);
  else if (['layout', 'equipment', 'laptop', 'tablecloth', 'room'].includes(name)) state[name] = input.value;
  else if (['tableware', 'food', 'banner', 'carpet', 'decor'].includes(name)) state[name] = input.checked;
  if (name === 'equipment' && state.equipment !== 'yes') { state.laptop = 'own'; form.elements.laptop.value = 'own'; }
  if (name === 'food' && !state.food) { state.tablecloth = 'own'; form.elements.tablecloth.value = 'own'; }
  if (name === 'layout' && state.layout === 'two') calendarPreviewRoom = 'sakura';
  render();
}
form.addEventListener('change', updateAnswer);
form.addEventListener('input', event => {
  if (['date', 'foodTables', 'customDuration'].includes(event.target.name)) updateAnswer(event);
});

app.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.id === 'back' && step > 0) goTo(step - 1);
  if (button.dataset.step !== undefined && Number(button.dataset.step) <= step) goTo(Number(button.dataset.step));
  if (button.dataset.guestRange) {
    state.guestRange = button.dataset.guestRange;
    state.guests = Number(state.guestRange.split(':')[1]);
    $('#selection-message').textContent = ''; render();
  }
  if (button.dataset.useTime) {
    state.startTime = button.dataset.useTime; $('#start-time').value = state.startTime; goTo(0); checkCalendar();
  }
  if (button.id === 'retry-calendar') checkCalendar();
  if (button.dataset.preview) { previewRoom = button.dataset.preview; renderPreview(calculateQuote(state)); }
  if (button.dataset.carouselDirection) {
    const rooms = status === 'ready' ? Object.keys(availability).filter(room => availability[room]) : [];
    if (rooms.length > 1) {
      const index = rooms.indexOf(calendarPreviewRoom);
      calendarPreviewRoom = rooms[(index + Number(button.dataset.carouselDirection) + rooms.length) % rooms.length];
      renderPreview(calculateQuote(state));
    }
  }
  if (button.id === 'restart') {
    state = initial(); step = 0; furthest = 0; previewRoom = 'aura'; calendarPreviewRoom = 'aura'; $('#selection-message').textContent = '';
    writeInputs(); goTo(0); checkCalendar();
  }
});

// Selected options stay in memory only. There is no form submission or contact storage.
writeInputs(); checkCalendar();
