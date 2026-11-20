const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, 'BiginSync.gs'), 'utf8');
const sandbox = {console, Date, Map, Set, Utilities:{formatDate:()=> '20261120-120000'}};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const header = vm.runInContext('BIGIN_REPORT_HEADER', sandbox);
assert.equal(header.length,17);
assert.deepEqual(Array.from(header.slice(8,12)), ['Години','Кількість годин Bigin','Додатокві години','Сума Bigin']);
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
const row=['01.11.2026','02.09.2026','Aura','Event','Name','123','','','10:00–12:00', '2','0.5','3250','service','=L3','note','info','999999999999999999'];
const plan=sandbox.planBiginReport_([row],[]);
assert.equal(plan.additions.length,0);
assert.throws(()=>sandbox.planBiginReport_([row,row],[]),/повторный ID/);
const booking={id:'8',key:sandbox.biginReportKey_(row[0],row[1],row[3],row[8]),primary:[1,2,'Aura','Event','Name','123','','',row[8],2],info:''};
const unlinked=row.slice(); unlinked[16]='';
const bound=sandbox.planBiginReport_([unlinked],[booking]);
assert.equal(bound.bindings[0].id,'8');
// Migration adds a default final-amount formula and preserves manual source cells.
const legacy=Array.from(header);const [svc]=legacy.splice(12,1);legacy.splice(14,0,svc);legacy.splice(12,1);legacy[9]='Кількість годин';legacy[11]='Сумма';
let grid=[legacy,['ЛИСТОПАД 2026',...Array(15).fill('')],
 ['01.11.2026','02.09.2026','Aura','Event','Name','123','','','10:00–12:00',2,'0.5',3250,'note','service','info','999999999999999999']];
let inserts=0,hidden=0;
const sheet={getLastRow:()=>grid.length,getMaxRows:()=>grid.length,getMaxColumns:()=>grid[0].length,
 getRange(r,c,n=1,w=1){return {
  getDisplayValues:()=>grid.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w).map(String)),
  getValues:()=>grid.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w)),
  setValues(v){v.forEach((row,i)=>row.forEach((x,j)=>grid[r-1+i][c-1+j]=x));return this;},
  setFontWeight(){return this;},breakApart(){return this;},merge(){return this;},setNumberFormat(){return this;},
  setFormula(v){grid[r-1][c-1]=v;return this;}
 };},moveColumns(range,dest){grid.forEach(row=>{const [v]=row.splice(14,1);row.splice(dest-1,0,v);});},insertColumnBefore(c){inserts++;grid.forEach(row=>row.splice(c-1,0,''));},hideColumns(c){hidden=c;}};
sandbox.PropertiesService={getScriptProperties:()=>({getProperty:name=>name==='BIGIN_SHEET_ID'?'test':'Report'})};
sandbox.SpreadsheetApp={openById:()=>({getSheetByName:()=>sheet}),flush(){}};
sandbox.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
sandbox.migrateBiginReportColumns();
assert.equal(inserts,1);assert.equal(hidden,17);assert.equal(grid[2][13],'=L3');
assert.equal(grid[2][11],3250);assert.equal(grid[2][10],'0.5');
assert.deepEqual(grid[2].slice(14),['note','info','999999999999999999']);
grid[2][13]=3000; // Manual override must survive a repeated migration.
sandbox.migrateBiginReportColumns();assert.equal(inserts,1);assert.equal(grid[2][13],3000);
console.log('Passed: schema, fractional hours, tariff boundary, ID binding and final amount migration/override preservation.');
// Verify writes use the new column count and leave extra hours blank.
let written;
const range = {setNumberFormat(){return this;},setValues(v){written=v;return this;}};
const outputSheet={getLastRow:()=>1,getMaxRows:()=>100,getRange:()=>range};
const newBooking={primary:[46000,45900,'Aura','Event','','','','','10:00–12:00',2],info:'description',id:'123'};
sandbox.writeBiginReport_(outputSheet,{bindings:[],monthWrites:[[2,[{bookings:[newBooking]}]]]},1,false);
assert.equal(written[0].length,17);
assert.equal(written[0][8],'10:00–12:00');
assert.equal(written[0][9],2);
assert.equal(written[0][10],'');
assert.equal(written[0][11],sandbox.biginAmountFormula_(2));
assert.equal(written[0][13],'=L2');
assert.equal(written[0][16],'123');
console.log('Passed: new row writing with 17 columns, a linked final amount and blank manual extra hours.');


