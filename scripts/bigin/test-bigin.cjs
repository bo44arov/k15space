const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, 'BiginSync.gs'), 'utf8');
const sandbox = {console, Date, Map, Set, Utilities:{formatDate:()=> '20261120-120000'}};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const header = vm.runInContext('BIGIN_REPORT_HEADER', sandbox);
assert.equal(header.length,16);
assert.deepEqual(Array.from(header.slice(8,12)), ['Години','Кількість годин','Додатокві години','Сумма']);
assert.equal(sandbox.biginAmountFormula_(5),'=ROUND((J5+K5)*IF(B5>DATE(2026,9,1),1300,800),2)');
function evaluateFormula(row, base, extra, created) {
  const formula = sandbox.biginAmountFormula_(row).slice(1)
    .replaceAll('J'+row, String(base)).replaceAll('K'+row,extra === '' ? '0' : String(extra))
    .replaceAll('B'+row, String(created));
  return Function('ROUND','IF','DATE','return '+formula)(
    (v,p)=>Math.round(v*10**p)/10**p,(condition,a,b)=>condition?a:b,
    (y,m,d)=>Date.UTC(y,m-1,d)/86400000+25569);
}
const boundary=Date.UTC(2026,8,1)/86400000+25569;
assert.equal(evaluateFormula(5,2,'',boundary),1600);
assert.equal(evaluateFormula(5,2,0.5,boundary+1),3250);
const row=['01.11.2026','02.09.2026','Aura','Event','Name','123','','','10:00–12:00', '2','0.5','3250','note','service','info','999999999999999999'];
const plan=sandbox.planBiginReport_([row],[]);
assert.equal(plan.additions.length,0);
assert.throws(()=>sandbox.planBiginReport_([row,row],[]),/повторный ID/);
const booking={id:'8',key:sandbox.biginReportKey_(row[0],row[1],row[3],row[8]),primary:[1,2,'Aura','Event','Name','123','','',row[8],2],info:''};
const unlinked=row.slice(); unlinked[15]='';
const bound=sandbox.planBiginReport_([unlinked],[booking]);
assert.equal(bound.bindings[0].id,'8');
// A functional sheet double verifies structural moves, formulas and repeat migration without backups.
let grid = [
 [...header.slice(0,8),'Кількість годин','Години','Сумма','Примітки','дод послуги','Інформація','Bigin Event ID'],
 ['ЛИСТОПАД 2026',...Array(14).fill('')],
 ['01.11.2026','02.09.2026','Aura','Event','Name','123','','',2,'10:00–12:00',2600,'note','service','info','999999999999999999']
];
let backups=0, hidden=0;
const sheet={
 getLastRow:()=>grid.length, getMaxRows:()=>grid.length,
 getMaxColumns:()=>grid[0].length, getName:()=> 'Report',
 getRange(r,c,n=1,w=1) { return {
   column:c,
   getValues:()=>grid.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w)),
   getDisplayValues:()=>grid.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w).map(String)),
   setValues(values){values.forEach((row,i)=>row.forEach((v,j)=>grid[r-1+i][c-1+j]=v));return this;},
   setFontWeight(){return this;}, breakApart(){return this;}, merge(){return this;},
   setNumberFormat(){return this;},setFormula(v){grid[r-1][c-1]=v;return this;}
 }; },
 copyTo(){backups++;return {setName(){},getSheetId:()=>42};},
 moveColumns(range,dest){grid.forEach(row=>{const [v]=row.splice(range.column-1,1);row.splice(dest-2,0,v);});},
 insertColumnBefore(c){grid.forEach(row=>row.splice(c-1,0,''));},
 hideColumns(c){hidden=c;}
};
sandbox.PropertiesService={getScriptProperties:()=>({getProperty:name=>name==='BIGIN_SHEET_ID'?'test':'Report'})};
sandbox.SpreadsheetApp={openById:()=>({getSheetByName:()=>sheet}),flush(){}};
sandbox.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
sandbox.migrateBiginReportColumns();
assert.equal(backups,0); assert.equal(hidden,16);
assert.equal(grid[2][8],'10:00–12:00'); assert.equal(grid[2][9],2);
assert.equal(grid[2][10],''); assert.equal(grid[2][11],sandbox.biginAmountFormula_(3));
assert.deepEqual(grid[2].slice(12),['note','service','info','999999999999999999']);
sandbox.migrateBiginReportColumns();assert.equal(backups,0);
console.log('Passed: schema, amount including blank/fractional hours and tariff boundary, ID dedup, binding, legacy migration preservation and idempotency.');

// Verify writes use the new column count and leave extra hours blank.
let written;
const range = {setNumberFormat(){return this;},setValues(v){written=v;return this;}};
const outputSheet={getLastRow:()=>1,getMaxRows:()=>100,getRange:()=>range};
const newBooking={primary:[46000,45900,'Aura','Event','','','','','10:00–12:00',2],info:'description',id:'123'};
sandbox.writeBiginReport_(outputSheet,{bindings:[],monthWrites:[[2,[{bookings:[newBooking]}]]]},1,false);
assert.equal(written[0].length,16);
assert.equal(written[0][8],'10:00–12:00');
assert.equal(written[0][9],2);
assert.equal(written[0][10],'');
assert.equal(written[0][11],sandbox.biginAmountFormula_(2));
assert.equal(written[0][15],'123');
console.log('Passed: new row writing with 16 columns and blank manual extra hours.');


