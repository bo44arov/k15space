/**
 * Используйте отдельный закрытый проект Apps Script.
 * Настройки проекта → Свойства скрипта:
 *   BIGIN_SHEET_ID, BIGIN_CLIENT_ID, BIGIN_CLIENT_SECRET, BIGIN_REFRESH_TOKEN.
 * Вместо BIGIN_REFRESH_TOKEN можно указать свежий BIGIN_AUTH_CODE и один раз
 * запустить exchangeBiginCode. Он сохранит токен и удалит одноразовый код.
 * Для итоговой вкладки, импорт и обновление расписания: previewBiginReportSync → syncBiginReport →
 * installBiginReportHourlySync. Название вкладки можно задать BIGIN_REPORT_TAB.
 * syncBiginEvents и installBiginHourlySync относятся к базовой выгрузке.
 */
const BIGIN_ACCOUNTS = 'https://accounts.zoho.com/oauth/v2/token';
const BIGIN_EVENTS = 'https://www.zohoapis.com/bigin/v2/Events';
const BIGIN_TAB = 'События Bigin';
const BIGIN_HEADER = ['ID события', 'Начало · Киев', 'Конец · Киев', 'Статус', 'Длительность, ч'];
const BIGIN_REPORT_HEADER = [
  'Дата', 'Створено', 'Зала', 'Захід', "Ім'я", 'Номер тел',
  'Посилання на інсту', 'Інста', 'Години', 'Кількість годин Bigin', 'Додатокві години', 'Сума Bigin', 'дод послуги', 'Фінальна сума',
  'Примітки', 'Інформація', 'Bigin Event ID'
];
const BIGIN_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BIGIN_KYIV = 'Europe/Kyiv';
const BIGIN_MONTHS = ['СІЧЕНЬ', 'ЛЮТИЙ', 'БЕРЕЗЕНЬ', 'КВІТЕНЬ', 'ТРАВЕНЬ', 'ЧЕРВЕНЬ',
  'ЛИПЕНЬ', 'СЕРПЕНЬ', 'ВЕРЕСЕНЬ', 'ЖОВТЕНЬ', 'ЛИСТОПАД', 'ГРУДЕНЬ'];

function exchangeBiginCode() {
  const properties = PropertiesService.getScriptProperties();
  const response = requestBiginToken_({
    grant_type: 'authorization_code',
    code: requiredBiginProperty_(properties, 'BIGIN_AUTH_CODE')
  }, properties);
  if (!response.refresh_token) {
    throw new Error('Zoho не вернул токен обновления.');
  }
  properties.setProperty('BIGIN_REFRESH_TOKEN', response.refresh_token);
  properties.deleteProperty('BIGIN_AUTH_CODE');
}

function syncBiginEvents() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const workbook = SpreadsheetApp.openById(requiredBiginProperty_(properties, 'BIGIN_SHEET_ID'));
    const previous = workbook.getSheetByName(BIGIN_TAB);
    if (previous && previous.getLastRow() > 0 &&
        previous.getRange(1, 1, 1, BIGIN_HEADER.length).getValues()[0].join('|') !== BIGIN_HEADER.join('|')) {
      throw new Error('На вкладке «События Bigin» обнаружены другие данные.');
    }
    const auth = requestBiginToken_({
      grant_type: 'refresh_token',
      refresh_token: requiredBiginProperty_(properties, 'BIGIN_REFRESH_TOKEN')
    }, properties);
    const events = readBiginEvents_(auth.access_token);
    const rows = [BIGIN_HEADER, ...events.map(formatBiginEvent_)];
    const sheet = previous || workbook.insertSheet(BIGIN_TAB);
    const rowCount = Math.max(rows.length, sheet.getLastRow());
    if (rowCount > sheet.getMaxRows()) {
      sheet.insertRowsAfter(sheet.getMaxRows(), rowCount - sheet.getMaxRows());
    }
    while (rows.length < rowCount) rows.push(['', '', '', '', '']);
    sheet.getRange(1, 1, rowCount, 3).setNumberFormat('@');
    sheet.getRange(1, 1, rowCount, BIGIN_HEADER.length).setValues(rows);
    if (!previous) {
      sheet.setFrozenRows(1);
      sheet.getRange('A1:E1').setBackground('#244763').setFontColor('#ffffff').setFontWeight('bold');
      sheet.setColumnWidths(1, 5, 175);
    }
    SpreadsheetApp.flush();
    console.log('Событий Bigin записано: ' + events.length);
  } finally {
    lock.releaseLock();
  }
}

function installBiginHourlySync() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const installed = ScriptApp.getProjectTriggers()
      .some(trigger => trigger.getHandlerFunction() === 'syncBiginEvents');
    if (!installed) {
      ScriptApp.newTrigger('syncBiginEvents').timeBased().everyHours(1).create();
    }
  } finally {
    lock.releaseLock();
  }
}

function requestBiginToken_(grant, properties) {
  const response = biginRequest_(BIGIN_ACCOUNTS, {
    method: 'post',
    payload: {
      ...grant,
      client_id: requiredBiginProperty_(properties, 'BIGIN_CLIENT_ID'),
      client_secret: requiredBiginProperty_(properties, 'BIGIN_CLIENT_SECRET')
    }
  });
  if (!response.access_token) {
    const knownErrors = ['invalid_client', 'invalid_client_secret', 'invalid_code', 'invalid_grant'];
    const error = knownErrors.includes(response.error) ? response.error : 'токен доступа отсутствует';
    throw new Error('Авторизация Zoho: ' + error);
  }
  return response;
}

function readBiginEvents_(accessToken) {
  return readBiginModule_(BIGIN_EVENTS, 'Start_DateTime,End_DateTime,All_day,$event_cancelled', accessToken);
}

function readBiginModule_(endpoint, fields, accessToken, wantedIds) {
  const headers = { Authorization: 'Zoho-oauthtoken ' + accessToken };
  const records = new Map();
  const seenTokens = new Set();
  let page = 1;
  let pageToken = '';
  while (true) {
    const pagination = pageToken ? 'page_token=' + encodeURIComponent(pageToken) : 'page=' + page;
    const response = biginRequest_(
      endpoint + '?fields=' + encodeURIComponent(fields) + '&per_page=200&sort_by=id&sort_order=asc&' + pagination,
      { headers }
    );
    if (!response) break;
    if (!Array.isArray(response.data) || typeof response.info?.more_records !== 'boolean') {
      throw new Error('Неожиданный формат списка событий Bigin.');
    }
    for (const event of response.data) {
      if (typeof event.id !== 'string' || !/^\d+$/.test(event.id)) {
        throw new Error('Bigin вернул запись без корректного ID.');
      }
      if (!wantedIds || wantedIds.has(event.id)) records.set(event.id, event);
    }
    if (!response.info.more_records || (wantedIds && records.size === wantedIds.size)) break;
    if (!pageToken && page < 10) {
      page++;
    } else {
      pageToken = response.info.next_page_token;
      if (!pageToken || seenTokens.has(pageToken)) {
        throw new Error('Bigin не вернул следующую страницу событий.');
      }
      seenTokens.add(pageToken);
    }
  }
  return [...records.values()];
}

function previewBiginReportSync() {
  runBiginReport_(false);
}

function syncBiginReport() {
  runBiginReport_(true);
}

function installBiginReportHourlySync() {
  const properties = PropertiesService.getScriptProperties();
  const target = requiredBiginProperty_(properties, 'BIGIN_SHEET_ID');
  if (properties.getProperty('BIGIN_REPORT_VERIFIED') !== target + ':' + biginReportTab_(properties)) {
    throw new Error('Сначала выполните syncBiginReport и проверьте итоговую вкладку.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === 'syncBiginReport')) {
      ScriptApp.newTrigger('syncBiginReport').timeBased().everyHours(1).create();
    }
  } finally {
    lock.releaseLock();
  }
}

function runBiginReport_(write) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const target = requiredBiginProperty_(properties, 'BIGIN_SHEET_ID');
    const workbook = SpreadsheetApp.openById(target);
    const tab = biginReportTab_(properties);
    const sheet = workbook.getSheetByName(tab);
    const expectedLastRow = sheet ? sheet.getLastRow() : 0;
    const token = requestBiginToken_({
      grant_type: 'refresh_token',
      refresh_token: requiredBiginProperty_(properties, 'BIGIN_REFRESH_TOKEN')
    }, properties).access_token;
    const events = readBiginModule_(BIGIN_EVENTS,
      'Event_Title,Start_DateTime,End_DateTime,Created_Time,Description,Related_To,$related_module,$u_id', token)
      .filter(event => BIGIN_GUID.test(String(event.$u_id || '').trim()));
    let existing = [];
    let needsIdHeader = true;
    let width = 0;
    if (expectedLastRow) {
      width = Math.min(sheet.getMaxColumns(), BIGIN_REPORT_HEADER.length);
      const values = sheet.getRange(1, 1, expectedLastRow, width).getDisplayValues();
      const header = values.shift();
      if (!BIGIN_REPORT_HEADER.slice(0, -1).every((name, i) => header[i] === name) ||
          (header[BIGIN_REPORT_HEADER.length - 1] && header[BIGIN_REPORT_HEADER.length - 1] !== BIGIN_REPORT_HEADER[BIGIN_REPORT_HEADER.length - 1])) {
        throw new Error('Заголовки итоговой вкладки отличаются от ожидаемых.');
      }
      if (!header[BIGIN_REPORT_HEADER.length - 1] && values.some(row => row[BIGIN_REPORT_HEADER.length - 1])) {
        throw new Error('Столбец Q занят. Освободите его для Bigin Event ID.');
      }
      needsIdHeader = !header[BIGIN_REPORT_HEADER.length - 1];
      existing = values;
    }
    const existingIds = new Set(existing.map(row => String(row[BIGIN_REPORT_HEADER.length - 1] || '').trim()).filter(Boolean));
    const unseen = events.filter(event => !existingIds.has(event.id));
    const linked = new Set(events.map(biginContactId_).filter(Boolean));
    const contacts = linked.size
      ? readBiginModule_(BIGIN_EVENTS.replace(/Events$/, 'Contacts'), 'Phone,Instagram', token, linked)
      : [];
    const contactsById = new Map(contacts.map(contact => [contact.id, contact]));
    if (contacts.length !== linked.size) throw new Error('Не все связанные контакты доступны в Bigin; обновление остановлено до записи.');
    const allBookings = events.map(event => formatBiginReportEvent_(event, contactsById));
    const bookings = allBookings.filter(booking => !existingIds.has(booking.id));
    const plan = planBiginReport_(existing, bookings);
    const schedule = planBiginScheduleUpdates_(existing, allBookings);
    console.log(JSON.stringify({fromBigin: events.length, linkedExisting: plan.bindings.length,
      added: plan.additions.length, updated: schedule.updates.length, missingEvents: schedule.missing.length, scheduleChanges: schedule.updates.map(({id,previousDate,date,previousTimes,times,changedColumns}) => ({id,previousDate,date,previousTimes,times,changedColumns})), missingContacts: linked.size - contacts.length, preview: !write}));
    if (write) {
      if (existing.length && JSON.stringify(existing) !== JSON.stringify(
        sheet.getRange(2, 1, existing.length, width).getDisplayValues())) {
        throw new Error('Строки изменились во время первого сопоставления. Повторите запуск.');
      }
      const manualBefore = captureBiginManualFields_(sheet);
      const reportSheet = sheet || workbook.insertSheet(tab);
      writeBiginReport_(reportSheet, plan, expectedLastRow, needsIdHeader);
      SpreadsheetApp.flush();
      applyBiginScheduleUpdates_(reportSheet, schedule.updates);
      SpreadsheetApp.flush();
      const relocated = reconcileBiginMonthPlacement_(reportSheet);
      const movedRows = sortBiginMonthRows_(reportSheet);
      console.log('Rows moved across months: ' + relocated);
      console.log('Rows moved into date order: ' + movedRows);
      SpreadsheetApp.flush();
      applyBiginRowFontWeights_(reportSheet);
      SpreadsheetApp.flush();
      verifyBiginManualFields_(reportSheet, manualBefore);
      properties.setProperty('BIGIN_REPORT_VERIFIED', target + ':' + tab);
    }
  } finally {
    lock.releaseLock();
  }
}

function biginReportTab_(properties) {
  return properties.getProperty('BIGIN_REPORT_TAB')?.trim() || 'Заходи — облік';
}

function biginContactId_(event) {
  return event.$related_module === 'Contacts' ? event.Related_To?.id : '';
}

function formatBiginReportEvent_(event, contacts) {
  const [start, end, created] = [event.Start_DateTime, event.End_DateTime, event.Created_Time]
    .map(value => new Date(value || NaN));
  if (![start, end, created].every(date => Number.isFinite(+date)) || end < start) {
    throw new Error('Неверное время события Bigin ' + event.id);
  }
  const contactId = biginContactId_(event);
  const contact = contacts.get(contactId);
  const title = event.Event_Title || '';
  const name = contactId ? event.Related_To.name || '' : '';
  const times = [start, end].map(date => Utilities.formatDate(date, BIGIN_KYIV, 'HH:mm')).join('–');
  const dates = [start, created].map(date => Utilities.formatDate(date, BIGIN_KYIV, 'dd.MM.yyyy'));
  const [link, instagram] = biginInstagram_(contact?.Instagram);
  return {
    id: event.id,
    key: biginReportKey_(dates[0], dates[1], title, times),
    primary: [...dates.map(biginDateSerial_), title.toUpperCase().includes('AURA') ? 'Aura' : 'Sakura',
      title, name, contact?.Phone || '', link, instagram, times, (+end - +start) / 3600000],
    info: event.Description || ''
  };
}

function biginDateSerial_(date) {
  const [day, month, year] = date.split('.').map(Number);
  return Date.UTC(year, month - 1, day) / 86400000 + 25569;
}

function biginInstagram_(raw) {
  const value = String(raw || '').trim();
  const handle = value.replace(/^@/, '')
    .replace(/^(?:https?:\/\/)?(?:(?:www|m)\.)?instagram\.com\//i, '')
    .split(/[?#]/)[0].replace(/\/$/, '');
  if (!/^[A-Za-z0-9_.]{1,30}$/.test(handle)) return ['', value];
  return ['https://www.instagram.com/' + handle + '/', '@' + handle];
}

function biginReportKey_(date, created, title, times) {
  return JSON.stringify([date, created, title, times].map(value => String(value || '').trim()));
}

function planBiginReport_(existing, bookings) {
  const byKey = new Map();
  bookings.forEach(booking => {
    const group = byKey.get(booking.key) || [];
    group.push(booking);
    byKey.set(booking.key, group);
  });
  const used = new Set();
  const bindings = [];
  const unlinked = [];
  existing.forEach((cells, index) => {
    const row = index + 2;
    const id = String(cells[BIGIN_REPORT_HEADER.length - 1] || '').trim();
    if (!id) {
      if (cells.some(Boolean) && !biginMonthHeader_(cells)) unlinked.push({row, cells});
      return;
    }
    if (!/^\d+$/.test(id) || used.has(id)) throw new Error('Некорректный или повторный ID в строке ' + row);
    used.add(id);
  });
  unlinked.forEach(({row, cells}) => {
    const key = biginReportKey_(cells[0], cells[1], cells[3], cells[8]);
    let candidates = (byKey.get(key) || []).filter(booking => !used.has(booking.id));
    if (candidates.length > 1) {
      candidates = candidates.filter(booking => booking.primary[4] === cells[4] && booking.primary[5] === cells[5]);
    }
    if (candidates.length !== 1) throw new Error('Нельзя однозначно сопоставить строку ' + row + ' с Bigin.');
    const id = candidates[0].id;
    used.add(id);
    bindings.push({row, id});
  });
  const additions = bookings.filter(booking => !used.has(booking.id));
  return {bindings, additions, monthWrites: planBiginMonthWrites_(existing, additions)};
}

function biginMonthHeader_(cells) {
  if (cells.slice(1).some(Boolean)) return '';
  const match = String(cells[0] || '').match(/^(.+) (\d{4})$/);
  const index = match ? BIGIN_MONTHS.indexOf(match[1]) : -1;
  return index < 0 ? '' : match[2] + String(index + 1).padStart(2, '0');
}

function planBiginMonthWrites_(existing, additions) {
  const sections = new Map();
  let previous = '';
  existing.forEach((cells, i) => {
    const heading = biginMonthHeader_(cells);
    const date = String(cells[0] || '').match(/^\d{2}\.(\d{2})\.(\d{4})$/);
    const month = heading || (date ? date[2] + date[1] : '');
    if (!month) return;
    if (month < previous || (heading && sections.has(month))) {
      throw new Error('Проверьте порядок месяцев в строке ' + (i + 2));
    }
    if (!sections.has(month)) sections.set(month, {first: i + 2, heading: Boolean(heading)});
    previous = month;
  });
  const grouped = new Map();
  additions.forEach(booking => {
    const month = new Date((booking.primary[0] - 25569) * 86400000)
      .toISOString().slice(0, 7).replace('-', '');
    const list = grouped.get(month) || [];
    list.push(booking);
    grouped.set(month, list);
  });
  const writes = new Map();
  const add = (row, entry) => {
    const list = writes.get(row) || [];
    list.push(entry);
    writes.set(row, list);
  };
  const months = [...new Set([...sections.keys(), ...grouped.keys()])].sort();
  months.forEach(month => {
    const section = sections.get(month);
    const next = [...sections.keys()].find(key => key > month);
    const boundary = next ? sections.get(next).first : existing.length + 2;
    if (!section?.heading) add(section?.first ?? boundary, {month});
    const bookings = grouped.get(month);
    if (bookings) add(boundary, {bookings: bookings.sort((a, b) => a.primary[0] - b.primary[0])});
  });
  return [...writes].sort(([a], [b]) => b - a);
}

function writeBiginReport_(sheet, plan, expectedLastRow, needsIdHeader) {
  const lastColumn = BIGIN_REPORT_HEADER.length;
  if (sheet.getLastRow() !== expectedLastRow) {
    throw new Error('Строки изменились во время подготовки. Повторите запуск.');
  }
  if (needsIdHeader) {
    if (sheet.getMaxColumns() < lastColumn) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), lastColumn - sheet.getMaxColumns());
    }
    if (!expectedLastRow) {
      sheet.getRange(1, 1, 1, lastColumn).setValues([BIGIN_REPORT_HEADER]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else {
      sheet.getRange(1, lastColumn).setValue(BIGIN_REPORT_HEADER[lastColumn - 1]);
    }
    sheet.hideColumns(lastColumn);
  }
  const groups = [];
  plan.bindings.forEach(binding => {
    const group = groups[groups.length - 1];
    if (group && group[group.length - 1].row + 1 === binding.row) group.push(binding);
    else groups.push([binding]);
  });
  groups.forEach(group => {
    sheet.getRange(group[0].row, lastColumn, group.length, 1)
      .setNumberFormat('@').setValues(group.map(({id}) => [id]));
  });
  const asCell = value => typeof value === 'string' && /^[=+\-@']/.test(value) ? "'" + value : value;
  plan.monthWrites.forEach(([first, entries]) => {
    const count = entries.reduce((total, entry) => total + (entry.bookings?.length || 1), 0);
    if (first <= expectedLastRow) {
      sheet.insertRowsBefore(first, count);
    } else if (sheet.getMaxRows() < first + count - 1) {
      sheet.insertRowsAfter(sheet.getMaxRows(), first + count - 1 - sheet.getMaxRows());
    }
    let row = first;
    entries.forEach(entry => {
      if (entry.month) {
        const name = BIGIN_MONTHS[Number(entry.month.slice(4)) - 1] + ' ' + entry.month.slice(0, 4);
        sheet.getRange(row++, 1, 1, lastColumn - 1).merge().setValue(name)
          .setFontWeight('bold').setHorizontalAlignment('center')
          .setBorder(true, true, true, true, false, false, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);
        return;
      }
      const size = entry.bookings.length;
      sheet.getRange(row, 1, size, 2).setNumberFormat('dd.mm.yyyy');
      sheet.getRange(row, 6, size, 1).setNumberFormat('@');
      sheet.getRange(row, lastColumn, size, 1).setNumberFormat('@');
      const values = entry.bookings.map((booking, index) => {
        const n = row + index;
        const amount = biginAmountFormula_(n);
        const title = booking.primary[3];
        if (isBiginTonyaDayOff_(title)) {
          const dayOff = Array(lastColumn).fill('');
          dayOff[0] = booking.primary[0];
          dayOff[3] = asCell(title);
          dayOff[lastColumn - 1] = booking.id;
          return dayOff;
        }
        return [...booking.primary.map(asCell), '', amount, '', '=L' + n, '', asCell(booking.info), booking.id];
      });
      sheet.getRange(row, 1, size, lastColumn).setValues(values);
      row += size;
    });
  });
}

function sortBiginMonthRows_(sheet) {
  const count = sheet.getLastRow() - 1;
  if (count < 2) return 0;
  const column = sheet.getRange(2, 1, count, 1);
  const timezone = sheet.getParent().getSpreadsheetTimeZone();
  const values = column.getValues();
  const labels = column.getDisplayValues();
  let sectionStart = 0;
  let moved = 0;
  const keys = labels.map(([label], index) => {
    if (biginMonthHeader_([label])) return 'heading';
    const value = values[index][0];
    const date = value instanceof Date
      ? Utilities.formatDate(value, timezone, 'dd.MM.yyyy')
      : String(label).trim();
    const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(date);
    return match ? Number(match[3]) * 10000 + Number(match[2]) * 100 + Number(match[1]) : 0;
  });
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    if (key === 'heading') {
      sectionStart = index + 1;
      continue;
    }
    if (!key) continue;
    let destination = sectionStart;
    while (destination < index && !(keys[destination] > key)) destination++;
    if (destination === index) continue;
    // Move the entire row, including manual columns, formulas and the hidden event ID.
    sheet.moveRows(sheet.getRange(index + 2, 1, 1, 1), destination + 2);
    keys.splice(index, 1);
    keys.splice(destination, 0, key);
    moved++;
  }
  return moved;
}

function formatBiginEvent_(event) {
  const start = event.Start_DateTime ? new Date(event.Start_DateTime) : null;
  const end = event.End_DateTime ? new Date(event.End_DateTime) : null;
  const valid = start && end && Number.isFinite(+start) && Number.isFinite(+end) && end >= start;
  const cancelled = event.$event_cancelled === true;
  const status = cancelled ? 'Отменено' : event.All_day ? 'Весь день' : valid ? 'В календаре' : 'Проверить время';
  return [
    event.id,
    valid ? Utilities.formatDate(start, 'Europe/Kyiv', 'yyyy-MM-dd HH:mm') : '',
    valid ? Utilities.formatDate(end, 'Europe/Kyiv', 'yyyy-MM-dd HH:mm') : '',
    status,
    valid && !event.All_day ? (+end - +start) / 3600000 : ''
  ];
}

function biginRequest_(url, options) {
  const response = UrlFetchApp.fetch(url, { ...options, followRedirects: false, muteHttpExceptions: true });
  const status = response.getResponseCode();
  if (status === 204) return null;
  if (status !== 200) throw new Error('Запрос к Zoho: HTTP ' + status);
  return JSON.parse(response.getContentText());
}

function requiredBiginProperty_(properties, name) {
  const value = properties.getProperty(name)?.trim();
  if (!value) throw new Error('Заполните свойство скрипта ' + name + '.');
  return value;
}


function biginAmountFormula_(row) {
  return '=ROUND((J' + row + '+K' + row + ')*IF(B' + row + '>DATE(2026,9,1),1300,800),2)';
}

// Imported fields: A:J and P. Manual fields K/M/N/O and the amount formula L are untouched.
function planBiginScheduleUpdates_(existing, bookings) {
  const byId = new Map(bookings.map(booking => [booking.id, booking]));
  const updates = [], missing = [];
  existing.forEach((cells, index) => {
    const id = String(cells[BIGIN_REPORT_HEADER.length - 1] || '').trim();
    if (!id) return;
    const booking = byId.get(id);
    if (!booking) { missing.push(id); return; }
    const dayOff = isBiginTonyaDayOff_(booking.primary[3]);
    const primary = dayOff ? [booking.primary[0], '', '', booking.primary[3], '', '', '', '', '', ''] : [...booking.primary];
    const info = dayOff ? '' : booking.info;
    const display = primary.map((value, i) => i < 2 && typeof value === 'number'
      ? Utilities.formatDate(new Date((value - 25569) * 86400000), 'UTC', 'dd.MM.yyyy') : String(value ?? ''));
    const changedColumns = [];
    display.forEach((value, i) => {
      const old = String(cells[i] ?? '');
      const equal = i === 9 && typeof primary[i] === 'number'
        ? old !== '' && Number.isFinite(Number(old.replace(',', '.'))) && Math.abs(Number(old.replace(',', '.')) - primary[i]) < 1e-8
        : old === value;
      if (!equal) changedColumns.push(i + 1);
    });
    if (String(cells[15] ?? '') !== String(info)) changedColumns.push(16);
    if (changedColumns.length) updates.push({id, primary, info, dayOff, changedColumns,
      date: display[0], previousDate: cells[0], times: primary[8], previousTimes: cells[8],
      hours: primary[9], previousRow: index + 2});
  });
  return {updates, missing};
}

function applyBiginScheduleUpdates_(sheet, updates) {
  if (!updates.length) return;
  const ids = sheet.getRange(2, BIGIN_REPORT_HEADER.length, sheet.getLastRow() - 1, 1).getDisplayValues();
  const positions = new Map(ids.map(([id], i) => [String(id).trim(), i + 2]));
  const asCell = value => typeof value === 'string' && /^[=+\-@']/.test(value) ? "'" + value : value;
  updates.forEach(update => {
    const row = positions.get(update.id);
    if (!row) throw new Error('Исчез ID перед обновлением: ' + update.id);
    if (update.changedColumns.some(column => column <= 10)) {
      sheet.getRange(row, 1, 1, 2).setNumberFormat('dd.mm.yyyy');
      sheet.getRange(row, 6, 1, 1).setNumberFormat('@');
      sheet.getRange(row, 9, 1, 1).setNumberFormat('@');
      sheet.getRange(row, 1, 1, 10).setValues([update.primary.map(asCell)]);
    }
    if (update.changedColumns.includes(16)) sheet.getRange(row, 16).setValue(asCell(update.info));
  });
}

// Compare manual literals and formula presence by stable event ID, even after row moves.
function captureBiginManualFields_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return new Map();
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, BIGIN_REPORT_HEADER.length);
  const values = range.getValues(), formulas = range.getFormulas();
  return new Map(values.map((row, i) => [String(row[BIGIN_REPORT_HEADER.length - 1] || '').trim(),
    [10, 12, 13, 14].map(column => formulas[i][column] ? {formula: true} : {value: row[column]})])
    .filter(([id]) => id));
}

function verifyBiginManualFields_(sheet, before) {
  const after = captureBiginManualFields_(sheet);
  before.forEach((fields, id) => {
    if (JSON.stringify(fields) !== JSON.stringify(after.get(id))) {
      throw new Error('Ручные поля изменились во время синхронизации, ID: ' + id);
    }
  });
  console.log('Manual fields verified: ' + before.size);
}

// Move whole rows across month sections; never rebuild customer/manual data.
function reconcileBiginMonthPlacement_(sheet) {
  let moved = 0;
  const read = () => sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, BIGIN_REPORT_HEADER.length).getDisplayValues() : [];
  let section = '';
  const ids = [];
  read().forEach(row => {
    section = biginMonthHeader_(row) || section;
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(row[0]));
    const id = String(row[BIGIN_REPORT_HEADER.length - 1] || '').trim();
    if (id && match && section !== match[3] + match[2]) ids.push(id);
  });
  ids.forEach(id => {
    let rows = read();
    let index = rows.findIndex(row => String(row[BIGIN_REPORT_HEADER.length - 1] || '').trim() === id);
    if (index < 0) throw new Error('Исчез ID при переносе: ' + id);
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(rows[index][0]));
    if (!match) return;
    const month = match[3] + match[2];
    let currentMonth = '';
    rows.slice(0, index).forEach(row => { currentMonth = biginMonthHeader_(row) || currentMonth; });
    if (currentMonth === month) return;
    if (!rows.some(row => biginMonthHeader_(row) === month)) {
      const next = rows.findIndex(row => {
        const heading = biginMonthHeader_(row);
        return heading && heading > month;
      });
      const first = next >= 0 ? next + 2 : sheet.getLastRow() + 1;
      if (first <= sheet.getLastRow()) sheet.insertRowsBefore(first, 1);
      else if (first > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 1);
      const name = BIGIN_MONTHS[Number(month.slice(4)) - 1] + ' ' + month.slice(0, 4);
      sheet.getRange(first, 1, 1, BIGIN_REPORT_HEADER.length - 1).merge().setValue(name)
        .setFontWeight('bold').setHorizontalAlignment('center')
        .setBorder(true, true, true, true, false, false, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);
      rows = read();
      index = rows.findIndex(row => String(row[BIGIN_REPORT_HEADER.length - 1] || '').trim() === id);
    }
    const headingIndex = rows.findIndex(row => biginMonthHeader_(row) === month);
    const nextHeading = rows.findIndex((row, i) => i > headingIndex && biginMonthHeader_(row));
    const destination = nextHeading >= 0 ? nextHeading + 2 : sheet.getLastRow() + 1;
    sheet.moveRows(sheet.getRange(index + 2, 1, 1, 1), destination);
    moved++;
  });
  return moved;
}

// Upgrade the 16-column extra-hours report in place; no backup is created.
function migrateBiginReportColumns() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const workbook = SpreadsheetApp.openById(requiredBiginProperty_(properties, 'BIGIN_SHEET_ID'));
    const sheet = workbook.getSheetByName(biginReportTab_(properties));
    if (!sheet || !sheet.getLastRow()) return;
    const data = sheet.getRange(1, 1, sheet.getLastRow(), Math.min(sheet.getMaxColumns(), 17)).getDisplayValues();
    const header = data.shift();
    if (BIGIN_REPORT_HEADER.every((name, i) => header[i] === name)) {
      console.log('Schema already migrated; final amounts preserved.');
      return;
    }
    const legacy = [...BIGIN_REPORT_HEADER];
    const [services] = legacy.splice(12, 1);
    legacy.splice(14, 0, services);
    legacy.splice(12, 1);
    legacy[9] = 'Кількість годин';
    legacy[11] = 'Сумма';
    if (!legacy.every((name, i) => header[i] === name)) {
      throw new Error('Неизвестная схема: ожидается текущая таблица с дополнительными часами и ID в P.');
    }
    const months = data.map((row, i) => biginMonthHeader_(row.slice(0, 16)) ? i + 2 : 0).filter(Boolean);
    months.forEach(row => sheet.getRange(row, 1, 1, 15).breakApart());
    sheet.insertColumnBefore(13);
    sheet.moveColumns(sheet.getRange(1, 15, sheet.getMaxRows(), 1), 13);
    sheet.getRange(1, 1, 1, 17).setValues([BIGIN_REPORT_HEADER]).setFontWeight('bold');
    let initialized = 0;
    data.forEach((cells, i) => {
      if (!cells[15]) return;
      if (/(^|[^\p{L}\p{M}\p{N}_])Тоня(?=$|[^\p{L}\p{M}\p{N}_])/iu.test(String(cells[3] || ''))) return;
      sheet.getRange(i + 2, 14).setFormula('=L' + (i + 2)).setNumberFormat('0.##');
      initialized++;
    });
    months.forEach(row => sheet.getRange(row, 1, 1, 16).merge());
    sheet.hideColumns(17);
    SpreadsheetApp.flush();
    console.log(JSON.stringify({migrated: true, initialized, backupCreated: false,
      headers: sheet.getRange(1, 1, 1, 17).getValues()[0]}));
  } finally {
    lock.releaseLock();
  }
}


// Only Tonya's days off are bold; monthly and column headings are regular too.
function formatBiginReportRows() {
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const p=PropertiesService.getScriptProperties();
    const w=SpreadsheetApp.openById(requiredBiginProperty_(p,'BIGIN_SHEET_ID'));
    const s=w.getSheetByName(biginReportTab_(p));
    if(!s)throw new Error('Report not found');
    applyBiginRowFontWeights_(s);
    SpreadsheetApp.flush();
    const values=s.getDataRange().getDisplayValues();
    const weights=s.getDataRange().getFontWeights();
    const boldRows=[];
    values.forEach((row,i)=>{
      const expected=i>0 && isBiginTonyaDayOff_(row[3]) ? 'bold' : 'normal';
      if(weights[i].some(weight=>weight!==expected))throw new Error('Unexpected font weight in row '+(i+1));
      if(expected==='bold')boldRows.push(i+1);
    });
    console.log(JSON.stringify({formatted:values.length,boldRows,verified:true}));
  }finally{lock.releaseLock();}
}

function isBiginTonyaDayOff_(title) {
  const text=String(title||'');
  return /(^|[^\p{L}\p{M}\p{N}_])Тон(?:я|і|и)(?=$|[^\p{L}\p{M}\p{N}_])/iu.test(text) &&
    /(?:вихідн|выходн)/iu.test(text);
}

function applyBiginRowFontWeights_(sheet) {
  const range=sheet.getDataRange();
  const rows=range.getDisplayValues();
  range.setFontWeight('normal');
  rows.forEach((row,index)=>{
    if(index>0 && isBiginTonyaDayOff_(row[3]))
      sheet.getRange(index+1,1,1,range.getNumColumns()).setFontWeight('bold');
  });
}


function migrateBiginServiceColumn() {
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const p=PropertiesService.getScriptProperties();
    const w=SpreadsheetApp.openById(requiredBiginProperty_(p,'BIGIN_SHEET_ID'));
    const s=w.getSheetByName(biginReportTab_(p));
    if(!s||!s.getLastRow())return;
    const range=s.getRange(1,1,s.getLastRow(),17);
    const before=range.getValues(),labels=range.getDisplayValues();
    if(BIGIN_REPORT_HEADER.every((name,i)=>labels[0][i]===name)){
      console.log('Service column already in place.');return;
    }
    const legacy=[...BIGIN_REPORT_HEADER];
    const [services]=legacy.splice(12,1);legacy.splice(14,0,services);
    if(!legacy.every((name,i)=>labels[0][i]===name))throw new Error('Unexpected report schema');
    const months=labels.slice(1).map((row,i)=>biginMonthHeader_(row)?i+2:0).filter(Boolean);
    months.forEach(row=>s.getRange(row,1,1,16).breakApart());
    s.moveColumns(s.getRange(1,15,s.getMaxRows(),1),13);
    s.getRange(1,1,1,17).setValues([BIGIN_REPORT_HEADER]);
    months.forEach(row=>s.getRange(row,1,1,16).merge());
    applyBiginRowFontWeights_(s);SpreadsheetApp.flush();
    const after=range.getValues();
    before.slice(1).forEach((row,i)=>{
      if(!row[16])return;
      const current=after[i+1];
      if(JSON.stringify([row[14],row[12],row[13],row[15],row[16]])!==
         JSON.stringify([current[12],current[13],current[14],current[15],current[16]]))
        throw new Error('Column move verification failed in row '+(i+2));
    });
    console.log(JSON.stringify({moved:true,verified:true,headers:after[0]}));
  }finally{lock.releaseLock();}
}


const BIGIN_CLIENTS_TAB = 'Клієнти Bigin';
const BIGIN_CLIENTS_HEADER = ["Ім'я", 'Телефон', 'Мобільний', 'Email', 'Instagram', 'Опис', 'Створено', 'Оновлено', 'Bigin Contact ID'];

// All remaining Contacts fields returned by the Bigin field metadata.
// Existing A:I stay in place; ID remains hidden in I.
const BIGIN_CLIENT_EXTRA_FIELDS = [
  ['field', 'Звідки дізналися?', 'text'], ['field1', 'Дата створення', 'datetime'],
  ['First_Name', "Ім’я Bigin", 'text'], ['Last_Name', 'Прізвище Bigin', 'text'],
  ['Owner', 'Відповідальний', 'object'], ['Created_By', 'Ким створено', 'object'],
  ['Modified_By', 'Ким оновлено', 'object'], ['Mailing_Street', 'Вулиця', 'text'],
  ['Mailing_City', 'Місто', 'text'], ['Mailing_State', 'Область', 'text'],
  ['Mailing_Zip', 'Поштовий індекс', 'text'], ['Mailing_Country', 'Країна', 'text'],
  ['Email_Opt_Out', 'Відмова від email', 'boolean'], ['Last_Activity_Time', 'Остання активність', 'datetime'],
  ['Tag', 'Теги', 'object'], ['Record_Image', 'Зображення контакту (ID)', 'text'],
  ['Unsubscribed_Mode', 'Спосіб відписки', 'text'], ['Unsubscribed_Time', 'Час відписки', 'datetime'],
  ['Record_Creation_Source_ID__s', 'ID джерела створення', 'text']
];
function biginClientExtraValue_(value, type) {
  if (value === null || value === undefined) return '';
  if (type === 'datetime' && value) {
    const date = new Date(value);
    if (Number.isFinite(+date)) return Utilities.formatDate(date, BIGIN_KYIV, 'dd.MM.yyyy HH:mm');
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function formatBiginClient_(contact, extraFields = []) {
  const name = contact.Full_Name || [contact.First_Name, contact.Last_Name].filter(Boolean).join(' ');
  const [link] = biginClientInstagram_(contact.Instagram);
  const stamp = value => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isFinite(+date) ? Utilities.formatDate(date, BIGIN_KYIV, 'dd.MM.yyyy HH:mm') : String(value);
  };
  return [String(name || ''), String(contact.Phone || ''), String(contact.Mobile || ''), String(contact.Email || ''),
    link || String(contact.Instagram || '').trim().replace(/^'+/, '').trim(), String(contact.Description || ''),
    stamp(contact.Created_Time), stamp(contact.Modified_Time), contact.id,
    ...extraFields.map(([api, , type]) => biginClientExtraValue_(contact[api], type))];
}

function planBiginClients_(existing, contacts, existingLinks, extraFields = []) {
  const positions = new Map();
  existing.forEach((cells, i) => {
    if (!cells.some(Boolean)) return;
    const id = String(cells[8] || '').trim();
    if (!/^\d+$/.test(id) || positions.has(id)) throw new Error('Некорректный или повторный Contact ID в строке ' + (i + 2));
    positions.set(id, i);
  });
  const seen = new Set(), jobs = [];
  let added = 0, updated = 0, instagramLinks = 0, invalidInstagram = 0;
  contacts.forEach(contact => {
    if (typeof contact.id !== 'string' || !/^\d+$/.test(contact.id) || seen.has(contact.id)) throw new Error('Некорректный или повторный ID контакта Bigin.');
    seen.add(contact.id);
    const values = formatBiginClient_(contact, extraFields);
    const link = biginClientInstagram_(contact.Instagram)[0];
    if (link) instagramLinks++;
    else if (contact.Instagram) invalidInstagram++;
    const previous = positions.get(contact.id);
    if (previous === undefined) {
      jobs.push({row: existing.length + 2 + added++, values, link});
    } else if (JSON.stringify(existing[previous].map(value => String(value ?? ''))) !== JSON.stringify(values) ||
        (existingLinks && String(existingLinks[previous] || '') !== link)) {
      jobs.push({row: previous + 2, values, link}); updated++;
    }
  });
  return {jobs: jobs.sort((a, b) => a.row - b.row), added, updated, instagramLinks, invalidInstagram};
}

function syncBiginClients() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const target = requiredBiginProperty_(properties, 'BIGIN_SHEET_ID');
    const workbook = SpreadsheetApp.openById(target);
    let sheet = workbook.getSheetByName(BIGIN_CLIENTS_TAB);
    const header = [...BIGIN_CLIENTS_HEADER, ...BIGIN_CLIENT_EXTRA_FIELDS.map(f => f[1])];
    const width = header.length;
    const lastRow = sheet ? sheet.getLastRow() : 0;
    let existing = [], existingLinks = [];
    if (lastRow) {
      if (sheet.getMaxColumns() < BIGIN_CLIENTS_HEADER.length) throw new Error('Недостаточно колонок во вкладке клиентов.');
      const values = sheet.getRange(1, 1, lastRow, Math.min(width, sheet.getMaxColumns())).getDisplayValues();
      if (!BIGIN_CLIENTS_HEADER.every((name, i) => values[0][i] === name)) throw new Error('Заголовки вкладки клиентов отличаются от ожидаемых.');
      if (values[0].slice(9).some((name, i) => name && name !== header[i + 9])) throw new Error('Новые колонки клиентов заняты другими данными.');
      existing = values.slice(1).map(row => [...row, ...Array(Math.max(0, width - row.length)).fill('')]);
      if (existing.length) existingLinks = sheet.getRange(2, 5, existing.length, 1).getRichTextValues().map(([value]) => value ? value.getLinkUrl() || '' : '');
    }
    const token = requestBiginToken_({grant_type: 'refresh_token', refresh_token: requiredBiginProperty_(properties, 'BIGIN_REFRESH_TOKEN')}, properties).access_token;
    const contacts = readBiginModule_(BIGIN_EVENTS.replace(/Events$/, 'Contacts'),
      [...new Set(['Full_Name','First_Name','Last_Name','Phone','Mobile','Email','Instagram','Description','Created_Time','Modified_Time', ...BIGIN_CLIENT_EXTRA_FIELDS.map(f => f[0])])].join(','), token);
    const plan = planBiginClients_(existing, contacts, existingLinks, BIGIN_CLIENT_EXTRA_FIELDS);
    if (sheet && (sheet.getLastRow() !== lastRow || (existing.length && JSON.stringify(existing) !== JSON.stringify(sheet.getRange(2, 1, existing.length, Math.min(width, sheet.getMaxColumns())).getDisplayValues().map(row => [...row, ...Array(Math.max(0, width - row.length)).fill('')]))))) {
      throw new Error('Вкладка клиентов изменилась во время подготовки. Повторите запуск.');
    }
    sheet = sheet || workbook.insertSheet(BIGIN_CLIENTS_TAB);
    if (sheet.getMaxColumns() < width) sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
    sheet.getRange(1, 1, 1, width).setValues([header]).setFontWeight('bold');
    if (!lastRow) {
      sheet.getRange(1, 1, 1, 9).setValues([BIGIN_CLIENTS_HEADER]).setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(1, 240); sheet.setColumnWidths(2, 3, 180);
      sheet.setColumnWidth(5, 330); sheet.setColumnWidth(6, 400); sheet.setColumnWidths(7, 2, 180);
      sheet.hideColumns(9);
    }
    const lastNeeded = Math.max(1, ...plan.jobs.map(job => job.row));
    if (lastNeeded > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), lastNeeded - sheet.getMaxRows());
    const groups = [];
    plan.jobs.forEach(job => {
      const group = groups[groups.length - 1];
      if (group && group[group.length - 1].row + 1 === job.row) group.push(job);
      else groups.push([job]);
    });
    const asCell = value => typeof value === 'string' && /^[=+\-@']/.test(value) ? "'" + value : value;
    groups.forEach(group => {
      sheet.getRange(group[0].row, 1, group.length, width).setNumberFormat('@').setValues(group.map(job => job.values.map(asCell)));
      sheet.getRange(group[0].row, 5, group.length, 1).setRichTextValues(group.map(job => {
        const text = SpreadsheetApp.newRichTextValue().setText(job.values[4]);
        if (job.link) text.setLinkUrl(job.link);
        return [text.build()];
      }));
    });
    SpreadsheetApp.flush();
    const finalRows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getDisplayValues() : [];
    const links = finalRows.length ? sheet.getRange(2, 5, finalRows.length, 1).getRichTextValues().map(([value]) => value ? value.getLinkUrl() || '' : '') : [];
    const verify = planBiginClients_(finalRows, contacts, links, BIGIN_CLIENT_EXTRA_FIELDS);
    if (verify.jobs.length) throw new Error('Проверка выгрузки клиентов не пройдена.');
    const hiddenIds = new Set(JSON.parse(properties.getProperty('BIGIN_CLIENTS_HIDDEN_IDS') || '[]'));
    finalRows.forEach((row, i) => { if (hiddenIds.has(row[8])) sheet.hideRows(i + 2); });
    const hiddenVerified = finalRows.filter((row, i) => hiddenIds.has(row[8]) && sheet.isRowHiddenByUser(i + 2)).length;
    if (hiddenVerified !== finalRows.filter(row => hiddenIds.has(row[8])).length) throw new Error('Проверка скрытых дублей не пройдена.');
    properties.setProperty('BIGIN_CLIENTS_VERIFIED', target + ':' + BIGIN_CLIENTS_TAB);
    console.log(JSON.stringify({fromBigin: contacts.length, added: plan.added, updated: plan.updated,
      exportedColumns: width, hiddenDuplicates: hiddenVerified, instagramLinks: plan.instagramLinks, invalidInstagram: plan.invalidInstagram, verified: true,
      sheetUrl: workbook.getUrl() + '#gid=' + sheet.getSheetId()}));
  } finally { lock.releaseLock(); }
}

function installBiginClientsHourlySync() {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const expected = requiredBiginProperty_(properties, 'BIGIN_SHEET_ID') + ':' + BIGIN_CLIENTS_TAB;
    if (properties.getProperty('BIGIN_CLIENTS_VERIFIED') !== expected) throw new Error('Сначала успешно выполните syncBiginClients.');
    const existing = ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === 'syncBiginClients');
    if (!existing.length) ScriptApp.newTrigger('syncBiginClients').timeBased().everyHours(1).create();
    console.log(JSON.stringify({handler: 'syncBiginClients', everyHours: 1, created: !existing.length,
      triggers: ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === 'syncBiginClients').length}));
  } finally { lock.releaseLock(); }
}

function biginClientInstagram_(raw) {
  return biginInstagram_(String(raw || '').trim().replace(/^'+/, '').trim());
}

// Hide lower-information cards sharing an exact normalized phone. Never delete CRM data.
// IDs persist in private Script Properties; later imports keep these rows hidden.
function hideBiginClientDuplicates() {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const p = PropertiesService.getScriptProperties();
    const sheet = SpreadsheetApp.openById(requiredBiginProperty_(p, 'BIGIN_SHEET_ID')).getSheetByName(BIGIN_CLIENTS_TAB);
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9 + BIGIN_CLIENT_EXTRA_FIELDS.length).getDisplayValues();
    const hidden = new Set(JSON.parse(p.getProperty('BIGIN_CLIENTS_HIDDEN_IDS') || '[]'));
    const groups = new Map();
    rows.forEach((r, i) => {
      let phone = r[1].replace(/\D/g, '');
      if (phone.length === 10 && phone[0] === '0') phone = '38' + phone;
      if (phone.length < 8) return;
      if (!groups.has(phone)) groups.set(phone, []);
      groups.get(phone).push({r, row: i + 2});
    });
    // Prefer populated business fields, then a full personal name, then longer information.
    const score = r => [r[1], r[2], r[3], r[4], r[5], r[9], r[10], ...r.slice(16, 21), r[23]].filter(Boolean).length * 10000 +
      Math.min(r[0].trim().split(/\s+/).length, 3) * 100 + Math.min([r[5], r[9]].join('').length, 99);
    let pairs = 0;
    groups.forEach(group => {
      if (group.length < 2) return;
      group.sort((a, b) => score(b.r) - score(a.r) || b.row - a.row);
      group.slice(1).forEach(item => hidden.add(item.r[8]));
      pairs++;
    });
    p.setProperty('BIGIN_CLIENTS_HIDDEN_IDS', JSON.stringify([...hidden]));
    rows.forEach((r, i) => { if (hidden.has(r[8])) sheet.hideRows(i + 2); });
    SpreadsheetApp.flush();
    const hiddenRows = rows.map((r, i) => hidden.has(r[8]) ? i + 2 : null).filter(Boolean);
    if (!hiddenRows.every(row => sheet.isRowHiddenByUser(row))) throw new Error('Не все дубли скрыты.');
    console.log(JSON.stringify({duplicateGroups:pairs, hiddenRows, hiddenCount:hiddenRows.length, verified:true}));
  } finally { lock.releaseLock(); }
}
