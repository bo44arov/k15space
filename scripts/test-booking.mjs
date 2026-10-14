import assert from 'node:assert/strict';
import { availabilityFor, calculateQuote, eligibleRooms, intervalError, kyivToday, overlaps, alternatives, previewStudio } from '../dist/js/booking/logic.mjs';
import { fetchDemoAvailability } from '../dist/js/booking/calendar.mjs';

const base = { date: kyivToday(), startTime: '08:00', duration: 180, guests: 10, layout: 'one', equipment: 'no', laptop: 'own', room: 'sakura' };
assert.deepEqual(availabilityFor(base), { aura: true, sakura: true });
assert.deepEqual(availabilityFor({ ...base, startTime: '12:00', duration: 60 }), { aura: false, sakura: true });
assert.deepEqual(availabilityFor({ ...base, startTime: '14:00', duration: 60 }), { aura: false, sakura: false });
assert.deepEqual(availabilityFor({ ...base, startTime: '15:00', duration: 60 }), { aura: false, sakura: false });
assert.deepEqual(availabilityFor({ ...base, startTime: '15:30', duration: 60 }), { aura: true, sakura: false });
assert.deepEqual(availabilityFor({ ...base, startTime: '11:00', duration: 120 }), { aura: false, sakura: true });
assert.deepEqual(availabilityFor({ ...base, startTime: '16:00', duration: 120 }), { aura: true, sakura: false });
assert.deepEqual(availabilityFor({ ...base, startTime: '16:30', duration: 120 }), { aura: true, sakura: true });
assert.deepEqual(availabilityFor({ ...base, startTime: '11:00', duration: 60 }), { aura: false, sakura: true });
assert.deepEqual(availabilityFor({ ...base, startTime: '10:30', duration: 60 }), { aura: true, sakura: true });
assert.deepEqual(availabilityFor({ ...base, startTime: '12:00', duration: 90 }), { aura: false, sakura: true });
assert.deepEqual(availabilityFor({ ...base, startTime: '12:00', duration: 120 }), { aura: false, sakura: false });
assert.equal(overlaps(600, 720, 720, 840), false);
assert.ok(intervalError({ ...base, startTime: '22:00', duration: 120 }));
assert.ok(intervalError({ ...base, duration: 75 }));
assert.ok(intervalError({ ...base, date: '2026-02-30' }));
assert.deepEqual(eligibleRooms(base, { aura: true, sakura: true }), ['aura', 'sakura']);
assert.deepEqual(eligibleRooms({ ...base, guests: 5, layout: 'two' }, { aura: true, sakura: true }), ['sakura']);
assert.deepEqual(eligibleRooms({ ...base, guests: 5, layout: 'two' }, { aura: true, sakura: false }), []);
assert.equal(previewStudio({ ...base, room: null, layout: 'two' }, ['sakura']), 'sakura');
assert.equal(previewStudio({ ...base, room: null, layout: 'two' }, []), 'sakura');
assert.equal(previewStudio({ ...base, room: null, layout: 'two' }, ['aura']), 'aura');
assert.equal(previewStudio({ ...base, room: null }, ['aura', 'sakura']), 'aura');
assert.equal(previewStudio({ ...base, room: 'both', layout: 'two' }, ['both'], 'aura'), 'aura');
assert.deepEqual(eligibleRooms({ ...base, equipment: 'yes' }, { aura: true, sakura: true }), ['sakura']);
assert.deepEqual(eligibleRooms({ ...base, equipment: 'help' }, { aura: true, sakura: true }), ['aura', 'sakura']);
assert.deepEqual(eligibleRooms({ ...base, guests: 15, layout: 'one' }, { aura: true, sakura: true }), []);
assert.deepEqual(eligibleRooms({ ...base, guests: 15, layout: 'two' }, { aura: true, sakura: true }), ['sakura']);
for (const guests of [20, 25]) {
  assert.deepEqual(eligibleRooms({ ...base, guests, layout: 'two' }, { aura: true, sakura: true }), ['both']);
  assert.deepEqual(eligibleRooms({ ...base, guests, layout: 'two' }, { aura: true, sakura: false }), []);
}
for (const [guests, amount] of [[8, 500], [10, 500], [11, 550], [12, 600]]) {
  assert.equal(calculateQuote({ ...base, guests, tableware: true }).items.find(i => i.key === 'tableware').amount, amount);
}
assert.equal(calculateQuote({ ...base, guests: 12, tableware: false }).items.some(i => i.key === 'tableware'), false);
for (const [guestRange, guests, min, max] of [['1:5', 5, 500, 500], ['6:10', 10, 500, 500], ['11:15', 15, 550, 750], ['16:20', 20, 800, 1000], ['21:35', 35, 1050, 1750]]) {
  const quote = calculateQuote({ ...base, guestRange, guests, tableware: true });
  assert.equal(quote.items.find(i => i.key === 'tableware').amount, min);
  assert.equal(quote.items.find(i => i.key === 'tableware').amountMax, max);
  assert.equal(quote.total, 3900 + min);
  assert.equal(quote.totalMax, 3900 + max);
}
assert.equal(calculateQuote({ ...base, guests: 12, equipment: 'yes', tableware: true, food: true, foodTables: 1, tablecloth: 'fabric' }).total, 5250);
assert.equal(calculateQuote({ ...base, food: true, foodTables: 2, tablecloth: 'fabric' }).total, 4400);
assert.equal(calculateQuote({ ...base, food: false, foodTables: 2, tablecloth: 'fabric' }).total, 3900);
assert.equal(calculateQuote({ ...base, equipment: 'help', laptop: 'rental' }).total, 3900);
assert.equal(calculateQuote({ ...base, room: 'both' }).total, 7800);
assert.equal(calculateQuote({ ...base, equipment: 'yes', laptop: 'rental' }).total, 4600);
assert.equal(calculateQuote({ ...base, decor: true }).consultations.length, 1);
assert.equal(calculateQuote({ ...base, banner: true, carpet: true }).total, 4750);
assert.equal(calculateQuote({ ...base, room: 'aura', banner: true, carpet: true }).total, 3900);
assert.equal(calculateQuote({ ...base, room: 'both', banner: true, carpet: true }).total, 8650);
assert.equal(calculateQuote({ ...base, room: null, banner: true, carpet: true }).total, 0);
const required = { ...base, startTime: '14:00', duration: 120, equipment: 'yes' };
assert.ok(alternatives(required, true).length);
assert.ok(alternatives({ ...base, startTime: '16:00', duration: 60, equipment: 'yes' }, true).some(slot => slot.time === '16:30'));
assert.ok(!alternatives({ ...base, startTime: '16:00', duration: 60, equipment: 'yes' }, true).some(slot => slot.time === '16:00'));
for (const slot of alternatives(required, true)) assert.deepEqual(eligibleRooms({ ...required, startTime: slot.time }, availabilityFor({ ...required, startTime: slot.time })), ['sakura']);
const controller = new AbortController();
const aborted = fetchDemoAvailability(base, { signal: controller.signal }); controller.abort();
await assert.rejects(aborted, { name: 'AbortError' });
await assert.rejects(fetchDemoAvailability(base, { simulateError: true }), /Тестова помилка/);
assert.deepEqual((await fetchDemoAvailability(base)).rooms, { aura: true, sakura: true });
assert.equal(kyivToday(new Date('2026-10-14T21:30:00Z')), '2026-10-15');
console.log('Booking prototype: interval, eligibility, pricing, consultation, cancellation and error checks passed.');
