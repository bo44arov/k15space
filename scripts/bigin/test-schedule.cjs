const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname,'BiginSync.gs'),'utf8');
function formatDate(d, timezone, format) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));
  return format==='HH:mm' ? `${parts.hour}:${parts.minute}` : `${parts.day}.${parts.month}.${parts.year}`;
}
const ctx={console,Date,Map,Set,Utilities:{formatDate},SpreadsheetApp:{BorderStyle:{SOLID_THICK:1}}};
vm.createContext(ctx);vm.runInContext(source,ctx);
const heading = name=>[name,...Array(17).fill('')];
const row=(id,date,times,hours)=>[date,'01.09.2026','Sakura','Event','Name','Phone','link','handle',times,hours,'0.5','=manualFormula','services','=L3','note','private description',id,'beyond schema'];
const event=(id,start='2026-12-20T16:00:00+02:00',end='2026-12-20T21:00:00+02:00')=>({id,Start_DateTime:start,End_DateTime:end});
const original=row('123','15.11.2026','16:00–20:00','4');
const snapshot=JSON.stringify(original);
const plan=ctx.planBiginScheduleUpdates_([original],[event('123')]);
assert.equal(plan.updates.length,1);assert.equal(plan.updates[0].date,'20.12.2026');assert.equal(plan.updates[0].hours,5);
assert.equal(JSON.stringify(original),snapshot);
assert.equal(ctx.planBiginScheduleUpdates_([row('123','20.12.2026','16:00–21:00','5')],[event('123')]).updates.length,0);
assert.equal(ctx.planBiginScheduleUpdates_([original],[]).missing.length,1);
assert.throws(()=>ctx.planBiginScheduleUpdates_([original],[event('123','bad')]),/Неверное время/);
const off=row('456','15.11.2026','','');off[3]='Тоня вихідний';
assert.equal(ctx.planBiginScheduleUpdates_([off],[event('456')]).updates[0].dayOff,true);
// Timezone changes around midnight and comma decimal quantities are handled.
const midnight=ctx.planBiginScheduleUpdates_([row('7','20.12.2026','00:30–01:30','1')],[event('7','2026-12-19T22:30:00Z','2026-12-19T23:30:00Z')]);
assert.equal(midnight.updates.length,0);
assert.equal(ctx.planBiginScheduleUpdates_([row('8','20.12.2026','16:00–18:30','2,5')],[event('8','2026-12-20T16:00:00+02:00','2026-12-20T18:30:00+02:00')]).updates.length,0);
// A sheet double moves entire rows, including cells beyond the managed schema.
class Sheet {
 constructor(rows){this.rows=[Array(17).fill('header'),...rows];}
 getLastRow(){return this.rows.length;}getMaxRows(){return this.rows.length;}
 getParent(){return {getSpreadsheetTimeZone:()=> 'Europe/Kyiv'};}
 getRange(r,c,n=1,w=1){const self=this;return {row:r,column:c,
  getDisplayValues(){return self.rows.slice(r-1,r-1+n).map(row=>Array.from({length:w},(_,j)=>String(row[c-1+j]??'')));},
  getValues(){return self.rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w));},
  setValue(v){self.rows[r-1][c-1]=c===1&&typeof v==='number'?formatDate(new Date((v-25569)*86400000),'UTC','dd.MM.yyyy'):v;return this;},
  setNumberFormat(){return this;},merge(){return this;},setFontWeight(){return this;},setHorizontalAlignment(){return this;},setBorder(){return this;}
 };}
 insertRowsBefore(r,n){this.rows.splice(r-1,0,...Array.from({length:n},()=>Array(17).fill('')));}
 insertRowsAfter(r,n){this.rows.splice(r,0,...Array.from({length:n},()=>Array(17).fill('')));}
 moveRows(range,destination){const index=range.row-1;const [row]=this.rows.splice(index,1);this.rows.splice(destination-1-(destination>range.row?1:0),0,row);}
}
for(const withDecember of [true,false]){
 const december=withDecember?[heading('ГРУДЕНЬ 2026'),row('999','21.12.2026','10:00–11:00','1')]:[];
 const sh=new Sheet([heading('ЛИСТОПАД 2026'),original.slice(),...december]);
 ctx.applyBiginScheduleUpdates_(sh,plan.updates);
 const changed=sh.rows.find(r=>r[16]==='123');
 assert.equal(changed[0],'20.12.2026');assert.equal(changed[8],'16:00–21:00');assert.equal(changed[9],5);
 assert.deepEqual(changed.slice(10),original.slice(10));assert.deepEqual(changed.slice(1,8),original.slice(1,8));
 assert.equal(ctx.reconcileBiginMonthPlacement_(sh),1);
 ctx.sortBiginMonthRows_(sh);
 const h=sh.rows.findIndex(r=>r[0]==='ГРУДЕНЬ 2026'),i=sh.rows.findIndex(r=>r[16]==='123');
 assert.equal(i,h+1);assert.equal(sh.rows.filter(r=>r[16]==='123').length,1);
 assert.equal(ctx.reconcileBiginMonthPlacement_(sh),0);
}
// Backward movement, multiple relocations, and same-month sorting.
const a=row('1','20.12.2026','16:00–17:00','1'),b=row('2','21.12.2026','16:00–17:00','1');
const sh=new Sheet([heading('ЛИСТОПАД 2026'),heading('ГРУДЕНЬ 2026'),a,b]);
const backwards=ctx.planBiginScheduleUpdates_([a,b],[event('1','2026-11-19T16:00:00+02:00','2026-11-19T17:00:00+02:00'),event('2','2026-11-18T16:00:00+02:00','2026-11-18T17:00:00+02:00')]);
ctx.applyBiginScheduleUpdates_(sh,backwards.updates);assert.equal(ctx.reconcileBiginMonthPlacement_(sh),2);ctx.sortBiginMonthRows_(sh);
assert.deepEqual(sh.rows.slice(1).filter(r=>r[16]).map(r=>r[16]),['2','1']);
console.log('Passed: schedule planning, invalid/missing records, timezone, day off, manual data/formula preservation, forward/backward month relocation, missing month creation, sorting and idempotency.');
