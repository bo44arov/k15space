// All scheduling and capacity rules below are provisional prototype settings.
export const CONFIG = {
  timezone: 'Europe/Kyiv', quoteVersion: 'demo-2026-10-14',
  opens: 7 * 60, closes: 23 * 60, minDuration: 60, increment: 30, cleanupMinutes: 30,
  capacity: { aura: 12, sakura: 19, bothFrom: 20, maximum: 35, sakuraOneTable: 14 },
  rates: { hourly: 1300, equipment: 500, laptop: 200, tableware: 500,
    extraGuest: 50, disposable: 50, fabric: 250, banner: 500, carpet: 350 },
  // These same fictional busy periods repeat on EVERY selected date.
  busy: { aura: [[720, 900]], sakura: [[840, 960]] },
};
export const ROOM_NAMES = { aura: 'AURA', sakura: 'SAKURA', both: 'AURA + SAKURA' };
export const LAYOUT_NAMES = { one: 'Один стіл', two: 'Два столи у SAKURA', free: 'Фуршет / вільне розміщення', chairs: 'Посадка без столів' };
