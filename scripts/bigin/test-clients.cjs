const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'BiginSync.gs'),'utf8');
const ctx={console,Date,Map,Set,Utilities:{formatDate:()=> '20.11.2026 12:00'}};
vm.createContext(ctx);vm.runInContext(source,ctx);
const a={id:'12345678901234567890',First_Name:'Test',Last_Name:'Client',Phone:'+12345',Email:'test@example.com',Instagram:'@example',Created_Time:'2026-11-20T10:00:00Z'};
const b={id:'2',Full_Name:'Second',Instagram:'https://www.instagram.com/second/?ref=test'};
let p=ctx.planBiginClients_([],[a,b],[]);
assert.equal(p.added,2);assert.equal(p.updated,0);assert.equal(p.instagramLinks,2);
assert.equal(p.jobs[0].values[4],'https://www.instagram.com/example/');
assert.equal(p.jobs[0].values[0],'Test Client');assert.equal(p.jobs[0].values[1],'+12345');
assert.equal(p.jobs[0].values[8],a.id);assert.equal(p.jobs[1].row,3);
const rows=p.jobs.map(j=>Array.from(j.values)),links=p.jobs.map(j=>j.link);
assert.equal(ctx.planBiginClients_(rows,[a,b],links).jobs.length,0);
// Existing row order can change; match by ID and append new contacts once.
const reordered=[rows[1],rows[0]];
const update={...a,Phone:'+54321',Instagram:'new_name'};
p=ctx.planBiginClients_(reordered,[update,b,{id:'3',Full_Name:'New'}],[links[1],links[0]]);
assert.equal(p.updated,1);assert.equal(p.added,1);assert.equal(p.jobs[0].row,3);assert.equal(p.jobs[1].row,4);
assert.equal(p.jobs[0].values[1],'+54321');
assert.equal(p.jobs[0].link,'https://www.instagram.com/new_name/');
// Repair a removed hyperlink without duplicating the contact.
assert.equal(ctx.planBiginClients_(rows,[a,b],['',links[1]]).updated,1);
assert.throws(()=>ctx.planBiginClients_([rows[0],rows[0]],[a],[]),/ID/);
assert.throws(()=>ctx.planBiginClients_([],[a,a],[]),/ID/);
const invalid=ctx.planBiginClients_([],[{id:'4',Instagram:'not a valid handle'}],[]);
assert.equal(invalid.invalidInstagram,1);assert.equal(invalid.jobs[0].link,'');
// Contacts that disappear from CRM are retained rather than implicitly deleted.
assert.equal(ctx.planBiginClients_(rows,[a],[links[0],links[1]]).jobs.length,0);
console.log('Passed: all-client export, Instagram URL normalization, link repair, ID precision, append/update, duplicates, invalid handles and repeat-run idempotency.');

assert.equal(ctx.formatBiginClient_({...a,Instagram:"'@example"})[4],'https://www.instagram.com/example/');

// Extra fields preserve their types, custom source and original ID position.
const extra=vm.runInContext('BIGIN_CLIENT_EXTRA_FIELDS',ctx);
const rich={...a,field:'Instagram',field1:'2026-11-20T10:00:00Z',Email_Opt_Out:false,Owner:{name:'Test Owner',id:'998877665544332211'}};
const extended=ctx.planBiginClients_([],[rich],[],extra);
assert.equal(extended.jobs[0].values.length,28);
assert.equal(extended.jobs[0].values[8],a.id);
assert.equal(extended.jobs[0].values[9],'Instagram');
assert.equal(extended.jobs[0].values[10],'20.11.2026 12:00');
assert.equal(extended.jobs[0].values[21],'false');
assert.match(extended.jobs[0].values[13],/998877665544332211/);
assert.equal(ctx.planBiginClients_([Array.from(extended.jobs[0].values)],[rich],[extended.jobs[0].link],extra).jobs.length,0);
// Hide by exact normalized phone, choose the richer card, preserve all values and IDs.
const oldCard=Array.from(ctx.formatBiginClient_({...a,id:'100',Full_Name:'Client',Phone:'+380 67 123 4567'},extra));
const fullCard=Array.from(ctx.formatBiginClient_({...a,id:'200',Full_Name:'Client Full',Phone:'0671234567',field:'Instagram',Description:'Details'},extra));
const different=Array.from(ctx.formatBiginClient_({...a,id:'300',Phone:'0671234568'},extra));
let privateProps={},hiddenRows=new Set();
ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>k==='BIGIN_SHEET_ID'?'sheet':privateProps[k],setProperty:(k,v)=>privateProps[k]=v})};
ctx.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
const mockSheet={getLastRow:()=>4,getRange:()=>({getDisplayValues:()=>[oldCard,fullCard,different]}),hideRows:r=>hiddenRows.add(r),isRowHiddenByUser:r=>hiddenRows.has(r)};
ctx.SpreadsheetApp={openById:()=>({getSheetByName:()=>mockSheet}),flush(){}};
ctx.hideBiginClientDuplicates();
assert.equal(JSON.stringify([...hiddenRows]),'[2]');
assert.equal(privateProps.BIGIN_CLIENTS_HIDDEN_IDS,'["100"]');
ctx.hideBiginClientDuplicates();
assert.equal(privateProps.BIGIN_CLIENTS_HIDDEN_IDS,'["100"]');
assert.equal(ctx.planBiginClients_([oldCard,fullCard],[{...a,id:'100',Full_Name:'Client',Phone:'+380 67 123 4567'},{...a,id:'200',Full_Name:'Client Full',Phone:'0671234567',field:'Instagram',Description:'Details'}],undefined,extra).added,0);
console.log('Passed: 28-column export, custom source/date, false values, object IDs, normalized duplicate selection and persistent hidden IDs.');
