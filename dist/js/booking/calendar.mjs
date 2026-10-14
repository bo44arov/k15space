import { availabilityFor, intervalError } from './logic.mjs';

// API-shaped local stub. No HTTP request or external calendar access occurs here.
export async function fetchDemoAvailability(state, { signal, simulateError = false } = {}) {
  const snapshot = { ...state };
  await new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Перевірку скасовано', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 650);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
  if (simulateError) throw new Error('Тестова помилка календаря');
  const error = intervalError(snapshot);
  if (error) throw new Error(error);
  return { mode: 'demo', date: snapshot.date, startTime: snapshot.startTime,
    duration: snapshot.duration, rooms: availabilityFor(snapshot) };
}
