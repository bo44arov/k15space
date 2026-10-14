import { CONFIG, ROOM_NAMES } from './config.mjs';

export function kyivToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = type => parts.find(p => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export const minutes = time => /^\d{2}:\d{2}$/.test(time || '')
  ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : NaN;
export const clock = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
export const overlaps = (start, end, busyStart, busyEnd) => start < busyEnd && end > busyStart;

export function intervalError(state) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(state.date || '')) return 'Оберіть дату.';
  const parsed = new Date(`${state.date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== state.date) return 'Перевірте дату.';
  if (state.date < kyivToday()) return 'Оберіть сьогоднішню або майбутню дату за київським часом.';
  const start = minutes(state.startTime), duration = state.duration;
  if (!Number.isFinite(start) || start < CONFIG.opens || start >= CONFIG.closes || start % CONFIG.increment)
    return 'Оберіть початок з 07:00 до 22:30 з кроком 30 хвилин.';
  if (!Number.isInteger(duration) || duration < CONFIG.minDuration || duration % CONFIG.increment)
    return 'Тривалість — від 1 години з кроком 30 хвилин.';
  if (start + duration > CONFIG.closes) return 'Увесь час оренди має завершитися до 23:00.';
  return '';
}

export function availabilityFor(state) {
  if (intervalError(state)) return { aura: false, sakura: false };
  const start = minutes(state.startTime), end = start + state.duration;
  // Both orders need cleanup: existing booking -> request, or request -> existing booking.
  return Object.fromEntries(Object.entries(CONFIG.busy).map(([room, periods]) =>
    [room, !periods.some(([a, b]) => overlaps(start, end + CONFIG.cleanupMinutes, a, b + CONFIG.cleanupMinutes))]));
}

export function eligibleRooms(state, availability) {
  const count = state.guests;
  if (!Number.isInteger(count) || count < 1 || count > CONFIG.capacity.maximum || !state.layout) return [];
  // One-table limits apply before the room is chosen. Other layout limits are demo rules.
  if (state.layout === 'one' && count > CONFIG.capacity.sakuraOneTable) return [];
  if (count >= CONFIG.capacity.bothFrom) return availability?.aura && availability?.sakura ? ['both'] : [];
  const rooms = [];
  if (availability?.aura && count <= CONFIG.capacity.aura && state.layout !== 'two' && state.equipment !== 'yes') rooms.push('aura');
  if (availability?.sakura) rooms.push('sakura');
  return rooms;
}

export function alternatives(state, applyRequirements = false) {
  const times = [];
  for (let start = CONFIG.opens; start + state.duration <= CONFIG.closes; start += CONFIG.increment) {
    const candidate = { ...state, startTime: clock(start) };
    const available = availabilityFor(candidate);
    const rooms = applyRequirements ? eligibleRooms(candidate, available)
      : Object.keys(available).filter(room => available[room]);
    if (rooms.length) times.push({ time: candidate.startTime, rooms });
  }
  const current = minutes(state.startTime);
  return times.sort((a, b) => Math.abs(minutes(a.time) - current) - Math.abs(minutes(b.time) - current)).slice(0, 3);
}

export const includesSakura = room => room === 'sakura' || room === 'both';

export function previewStudio(state, rooms = [], activeRoom = 'aura') {
  if (state.room === 'both') return activeRoom;
  if (state.room) return state.room;
  if (rooms.length === 1 && rooms[0] !== 'both') return rooms[0];
  if (state.layout === 'two' || state.equipment === 'yes' || state.guests > CONFIG.capacity.aura) return 'sakura';
  return 'aura';
}

export function guestBounds(state) {
  if (state.guestRange) {
    const [min, max] = state.guestRange.split(':').map(Number);
    return { min, max, approximate: true };
  }
  return { min: state.guests, max: state.guests, approximate: false };
}

export function calculateQuote(state) {
  const rates = CONFIG.rates, items = [];
  if (state.room) items.push({ key: 'rent', label: `${ROOM_NAMES[state.room]} · ${state.duration / 60} год × ${rates.hourly * (state.room === 'both' ? 2 : 1)} грн`,
    amount: state.duration / 60 * rates.hourly * (state.room === 'both' ? 2 : 1) });
  if (state.equipment === 'yes') items.push({ key: 'equipment', label: 'Проєктор і караоке', amount: rates.equipment });
  if (state.equipment === 'yes' && state.laptop === 'rental') items.push({ key: 'laptop', label: 'Ноутбук K15.Space', amount: rates.laptop });
  const guests = guestBounds(state);
  if (state.tableware && Number.isInteger(guests.min) && guests.min > 0 && Number.isInteger(guests.max) && guests.max >= guests.min)
    items.push({ key: 'tableware', label: guests.approximate ? `Посуд · орієнтовно ${guests.min}–${guests.max} гостей` : `Посуд · ${state.guests} гостей`,
      amount: rates.tableware + Math.max(0, guests.min - 10) * rates.extraGuest,
      amountMax: rates.tableware + Math.max(0, guests.max - 10) * rates.extraGuest });
  if (state.food && ['disposable', 'fabric'].includes(state.tablecloth) && state.foodTables > 0)
    items.push({ key: 'tablecloth', label: `${state.tablecloth === 'fabric' ? 'Біла тканинна' : 'Одноразова'} скатертина · столів: ${state.foodTables}`, amount: rates[state.tablecloth] * state.foodTables });
  if (includesSakura(state.room) && state.banner) items.push({ key: 'banner', label: 'Фотозона з банером · SAKURA', amount: rates.banner });
  if (includesSakura(state.room) && state.carpet) items.push({ key: 'carpet', label: 'Доріжка · SAKURA', amount: rates.carpet });
  const consultations = [];
  if (state.equipment === 'help') consultations.push('Обладнання — потрібна консультація');
  if (state.equipment === 'yes' && state.laptop === 'help') consultations.push('Підключення — потрібна консультація');
  if (state.decor) consultations.push('Декор під ключ — вартість уточнюється');
  return { items, total: items.reduce((sum, item) => sum + item.amount, 0),
    totalMax: items.reduce((sum, item) => sum + (item.amountMax ?? item.amount), 0), consultations };
}
