const STORAGE_KEY="seimosPinigai.v2";
const BANK_RULES_KEY="seimosPinigai.bankRules.v1";
const DB_NAME="seimosPinigaiDB";
const DB_VERSION=1;
const DB_STORE="appState";
const expenseCategories=[
  "Maistas",
  "Vaikai / mokykla / darželis",
  "Drabužiai / avalynė",
  "Kuras / automobilis",
  "Mokesčiai",
  "Buitis / namai",
  "Sveikata / vaistinė",
  "Mano poreikiai",
  "Vyro poreikiai",
  "Pramogos",
  "Prenumeratos",
  "Kita"
];
const incomeCategories=["Vaikų išmokos","Nedarbo išmoka","Vyro įnašas","Atlyginimas","Kitos pajamos"];
const childCategories=new Set(["Vaikai / mokykla / darželis"]);
const children=["Rajanas","Rusnė","Reina","Žemyna"];
const catMeta={
  "Maistas":{icon:"🍴",bg:"#fff0f2",bar:"#ef5b73"},
  "Vaikai / mokykla / darželis":{icon:"👧",bg:"#fff4e8",bar:"#ff8a2b"},
  "Drabužiai / avalynė":{icon:"👕",bg:"#edf4ff",bar:"#2d6bf3"},
  "Kuras / automobilis":{icon:"🚗",bg:"#edf4ff",bar:"#3974ee"},
  "Mokesčiai":{icon:"▤",bg:"#f3efff",bar:"#8155e6"},
  "Buitis / namai":{icon:"⌂",bg:"#eef7ff",bar:"#4d8edb"},
  "Sveikata / vaistinė":{icon:"♥",bg:"#eaf9f1",bar:"#0c9b5f"},
  "Mano poreikiai":{icon:"◉",bg:"#f3efff",bar:"#8155e6"},
  "Vyro poreikiai":{icon:"◉",bg:"#edf4ff",bar:"#3974ee"},
  "Pramogos":{icon:"★",bg:"#fff4e8",bar:"#ff8a2b"},
  "Prenumeratos":{icon:"▣",bg:"#eef3fb",bar:"#687b98"},
  "Kita":{icon:"•",bg:"#eef3fb",bar:"#687b98"}
};

let transactions=[];
let deleteId=null;
let bankRawRows=[];
let bankHeaders=[];
let bankDelimiter=",";
let bankPreviewRows=[];
let pdfPreviewRows=[];
let bankRules=loadBankRules();
let deferredInstallPrompt=null;
const $=id=>document.getElementById(id);

function loadLocalFallback(){
  try{const r=localStorage.getItem(STORAGE_KEY);return r?JSON.parse(r):[]}catch{return[]}
}
function openDb(){
  return new Promise((resolve,reject)=>{
    if(!("indexedDB" in window)){reject(new Error("IndexedDB nepalaikomas"));return}
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE)
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error("Nepavyko atidaryti duomenų bazės"))
  })
}
async function loadTransactionsFromDb(){
  try{
    const db=await openDb();
    const value=await new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,"readonly");
      const store=tx.objectStore(DB_STORE);
      const req=store.get("transactions");
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error)
    });
    db.close();
    if(Array.isArray(value))return value;

    // First launch after V6: migrate existing localStorage data if present.
    const fallback=loadLocalFallback();
    if(fallback.length){
      transactions=fallback;
      await persistTransactionsToDb();
      return fallback
    }
    return []
  }catch{
    return loadLocalFallback()
  }
}
async function persistTransactionsToDb(){
  // Keep a localStorage fallback as a second safety layer.
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(transactions))}catch{}
  try{
    const db=await openDb();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,"readwrite");
      tx.objectStore(DB_STORE).put(transactions,"transactions");
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error)
    });
    db.close()
  }catch{}
}
function save(){
  // No need to block the UI while IndexedDB writes.
  persistTransactionsToDb()
}
function loadBankRules(){
  try{const r=localStorage.getItem(BANK_RULES_KEY);return r?JSON.parse(r):{}}catch{return{}}
}
function saveBankRules(){try{localStorage.setItem(BANK_RULES_KEY,JSON.stringify(bankRules))}catch{}}
function euro(n){return new Intl.NumberFormat("lt-LT",{style:"currency",currency:"EUR"}).format(Number(n)||0)}
function today(){
  const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
}
function thisMonth(){
  const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`
}
function monthRows(){
  const m=$("monthInput").value;
  return transactions.filter(t=>t.date?.startsWith(m)).sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||0)-(a.createdAt||0))
}
function sum(type){return monthRows().filter(t=>t.type===type).reduce((s,t)=>s+Number(t.amount||0),0)}
function expenseRows(){return monthRows().filter(t=>t.type==="expense")}
function esc(v=""){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
function formatDate(iso){const [y,m,d]=iso.split("-");return `${d}.${m}.${y}`}
function shiftMonth(delta){
  const [y,m]=$("monthInput").value.split("-").map(Number);
  const d=new Date(y,m-1+delta,1);
  $("monthInput").value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;render();
}
function payerTotals(rows=expenseRows()){
  const r={"Aš":0,"Vyras":0,"Bendri pinigai":0};
  rows.forEach(t=>{if(t.payer in r)r[t.payer]+=Number(t.amount||0)});
  return r
}
function catTotals(){
  const m=new Map();
  expenseRows().forEach(t=>m.set(t.category,(m.get(t.category)||0)+Number(t.amount||0)));
  return [...m.entries()].sort((a,b)=>b[1]-a[1])
}
function renderSummary(){
  const income=sum("income"),expense=sum("expense"),balance=income-expense;
  $("incomeTotal").textContent=euro(income);
  $("expenseTotal").textContent=euro(expense);
  $("balanceTotal").textContent=euro(balance);
  $("balanceText").textContent=balance>=0?"Gerai sekasi 🙂":"Išlaidos viršija pajamas";

  const cats=catTotals();
  const list=$("categoryList");list.innerHTML="";
  if(!cats.length){list.innerHTML='<div class="tagline">Šį mėnesį išlaidų dar nėra.</div>'}
  else{
    cats.forEach(([name,amt])=>{
      const meta=catMeta[name]||catMeta.Kita;
      const pct=expense?Math.round(amt/expense*100):0;
      const el=document.createElement("div");el.className="cat-row";
      el.innerHTML=`<div class="cat-top"><div class="cat-icon" style="background:${meta.bg}">${meta.icon}</div><div><div class="cat-name">${esc(name)}</div></div><div class="cat-amt">${euro(amt)} <span class="pct">${pct}%</span></div></div><div class="progress"><span style="width:${pct}%;background:${meta.bar}"></span></div>`;
      list.appendChild(el)
    })
  }

  const pay=payerTotals();
  const total=expense||1;
  $("payerMe").textContent=euro(pay["Aš"]);
  $("payerHusband").textContent=euro(pay["Vyras"]);
  $("payerJoint").textContent=euro(pay["Bendri pinigai"]);
  $("payerMeBar").style.width=`${pay["Aš"]/total*100}%`;
  $("payerHusbandBar").style.width=`${pay["Vyras"]/total*100}%`;
  $("payerJointBar").style.width=`${pay["Bendri pinigai"]/total*100}%`;

  const my=expenseRows().filter(t=>t.category==="Mano poreikiai").reduce((s,t)=>s+Number(t.amount||0),0);
  const his=expenseRows().filter(t=>t.category==="Vyro poreikiai").reduce((s,t)=>s+Number(t.amount||0),0);
  const childrenTotal=expenseRows().filter(t=>childCategories.has(t.category)).reduce((s,t)=>s+Number(t.amount||0),0);
  $("myNeeds").textContent=euro(my);
  $("hisNeeds").textContent=euro(his);
  $("childrenNeeds").textContent=euro(childrenTotal);

  const childRows=expenseRows().filter(t=>childCategories.has(t.category));
  const childIdMap={"Rajanas":"Rajanas","Rusnė":"Rusne","Reina":"Reina","Žemyna":"Zemyna"};
  children.forEach(child=>{
    const rows=childRows.filter(t=>t.child===child);
    const total=rows.reduce((s,t)=>s+Number(t.amount||0),0);
    const key=childIdMap[child];
    $(`child${key}Total`).textContent=euro(total);
  });

  renderRows($("recentList"),monthRows().slice(0,5),false)
}
function renderRows(container,rows,actions){
  container.innerHTML="";
  if(!rows.length){container.innerHTML='<div class="tagline">Įrašų nėra.</div>';return}
  rows.forEach(t=>{
    const meta=t.type==="income"?{icon:"↗",bg:"#eaf9f1"}:(catMeta[t.category]||catMeta.Kita);
    const el=document.createElement("div");el.className="tx-item";
    el.innerHTML=`<div class="tx-icon" style="background:${meta.bg}">${meta.icon}</div>
      <div><div class="tx-name">${esc(t.name)}</div><div class="tx-sub">${formatDate(t.date)} · ${esc(t.category)}${t.child?` · ${esc(t.child)}`:""}${t.payer?` · ${esc(t.payer)}`:""}</div></div>
      <div><div class="tx-amt ${t.type}">${t.type==="expense"?"−":"+"}${euro(t.amount)}</div>${actions?`<div class="tiny-actions"><button class="tiny edit" data-id="${esc(t.id)}" type="button">✎</button><button class="tiny del" data-id="${esc(t.id)}" type="button">×</button></div>`:""}</div>`;
    container.appendChild(el)
  });
  if(actions){
    container.querySelectorAll(".edit").forEach(b=>b.addEventListener("click",()=>editEntry(b.dataset.id)));
    container.querySelectorAll(".del").forEach(b=>b.addEventListener("click",()=>askDelete(b.dataset.id)));
  }
}
function refreshFilters(){
  const sel=$("filterCategory"),old=sel.value;
  const cats=[...new Set(transactions.map(t=>t.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"lt"));
  sel.innerHTML='<option value="">Visos kategorijos</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join("");
  if(cats.includes(old))sel.value=old
}
function renderTransactions(){
  let rows=monthRows();
  const q=$("searchInput").value.trim().toLowerCase(),cat=$("filterCategory").value,type=$("filterType").value,child=$("filterChild").value;
  if(cat)rows=rows.filter(t=>t.category===cat);
  if(type)rows=rows.filter(t=>t.type===type);
  if(child)rows=rows.filter(t=>t.child===child);
  if(q)rows=rows.filter(t=>[t.name,t.category,t.child,t.payer,t.note].filter(Boolean).join(" ").toLowerCase().includes(q));
  renderRows($("transactionList"),rows,true)
}
function render(){renderSummary();refreshFilters();renderTransactions()}
function fillCats(type,selected=""){
  const cats=type==="expense"?expenseCategories:incomeCategories;
  $("categoryInput").innerHTML=cats.map(c=>`<option ${c===selected?"selected":""}>${esc(c)}</option>`).join("")
}
function updateChildField(){
  const show=$("entryType").value==="expense" && childCategories.has($("categoryInput").value);
  $("childField").classList.toggle("hidden",!show);
}
function openEntry(type,t=null){
  $("entryForm").reset();$("formError").textContent="";
  $("entryType").value=type;$("entryId").value=t?.id||"";
  const exp=type==="expense";
  $("modalKicker").textContent=exp?"IŠLAIDA":"PAJAMOS";
  $("modalTitle").textContent=t?(exp?"Redaguoti išlaidą":"Redaguoti pajamas"):(exp?"Pridėti išlaidą":"Pridėti pajamas");
  $("nameLabel").textContent=exp?"Kur išleista / ką pirkau":"Pajamų šaltinis";
  $("payerField").classList.toggle("hidden",!exp);
  fillCats(type,t?.category||"");
  $("childInput").value=t?.child||"Rajanas";
  updateChildField();
  $("amountInput").value=t?.amount??"";
  $("dateInput").value=t?.date||today();
  $("nameInput").value=t?.name||"";
  $("noteInput").value=t?.note||"";
  if(exp)$("payerInput").value=t?.payer||"Aš";
  $("entryDialog").showModal()
}
function closeEntry(){$("entryDialog").close()}
function editEntry(id){const t=transactions.find(x=>String(x.id)===String(id));if(t)openEntry(t.type,t)}
function submitEntry(e){
  e.preventDefault();
  const amount=Number($("amountInput").value),type=$("entryType").value;
  if(!(amount>0)||!$("dateInput").value||!$("nameInput").value.trim()){$("formError").textContent="Užpildyk sumą, datą ir pavadinimą.";return}
  const id=$("entryId").value||`${Date.now()}-${Math.random()}`;
  const old=transactions.find(t=>String(t.id)===String(id));
  const rec={id,type,amount:Math.round(amount*100)/100,date:$("dateInput").value,name:$("nameInput").value.trim(),category:$("categoryInput").value,child:(type==="expense"&&childCategories.has($("categoryInput").value))?$("childInput").value:"",payer:type==="expense"?$("payerInput").value:"",note:$("noteInput").value.trim(),createdAt:old?.createdAt||Date.now(),updatedAt:Date.now()};
  const i=transactions.findIndex(t=>String(t.id)===String(id));
  if(i>=0)transactions[i]=rec;else transactions.push(rec);
  save();$("monthInput").value=rec.date.slice(0,7);closeEntry();render()
}
function askDelete(id){deleteId=id;$("deleteDialog").showModal()}
function doDelete(){transactions=transactions.filter(t=>String(t.id)!==String(deleteId));save();$("deleteDialog").close();deleteId=null;render()}

function openChildDetails(child){
  const rows=expenseRows().filter(t=>childCategories.has(t.category) && t.child===child);
  const total=rows.reduce((s,t)=>s+Number(t.amount||0),0);
  const pay=payerTotals(rows);

  $("childDetailsTitle").textContent=`${child} – poreikiai`;
  $("detailChildTotal").textContent=euro(total);
  $("detailPaidMe").textContent=euro(pay["Aš"]);
  $("detailPaidHusband").textContent=euro(pay["Vyras"]);
  $("detailPaidJoint").textContent=euro(pay["Bendri pinigai"]);
  renderRows($("childDetailsList"),rows,false);
  $("childDetailsDialog").showModal();
}

function setTab(name){
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));
  $("overviewTab").classList.toggle("hidden",name!=="overview");
  $("transactionsTab").classList.toggle("hidden",name!=="transactions");
  $("dataTab").classList.toggle("hidden",name!=="data");
  document.querySelectorAll(".bottom-item").forEach(b=>b.classList.toggle("active",b.dataset.go===name))
}
function csvCell(v){return `"${String(v??"").replaceAll('"','""')}"`}
function exportCsv(){
  const h=["id","type","date","amount","name","category","child","payer","note","createdAt","updatedAt"];
  const lines=[h.join(","),...transactions.map(t=>h.map(k=>csvCell(t[k])).join(","))];
  const blob=new Blob(["\uFEFF"+lines.join("\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`seimos-pinigai-${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}

function monthLabel(ym){
  if(!/^\d{4}-\d{2}$/.test(ym))return ym;
  const [y,m]=ym.split("-").map(Number);
  const names=["sausis","vasaris","kovas","balandis","gegužė","birželis","liepa","rugpjūtis","rugsėjis","spalis","lapkritis","gruodis"];
  return `${y} m. ${names[m-1]}`;
}
function reportHtml(){
  const rows=monthRows();
  const income=sum("income"),expense=sum("expense"),balance=income-expense;
  const cats=catTotals();
  const pay=payerTotals();
  const my=expenseRows().filter(t=>t.category==="Mano poreikiai").reduce((s,t)=>s+Number(t.amount||0),0);
  const his=expenseRows().filter(t=>t.category==="Vyro poreikiai").reduce((s,t)=>s+Number(t.amount||0),0);
  const childRows=expenseRows().filter(t=>childCategories.has(t.category));
  const childrenTotal=childRows.reduce((s,t)=>s+Number(t.amount||0),0);

  const childLines=children.map(child=>{
    const cr=childRows.filter(t=>t.child===child);
    const total=cr.reduce((s,t)=>s+Number(t.amount||0),0);
    return `<div class="report-line"><span>${esc(child)}</span><strong>${euro(total)}</strong></div>`
  }).join("");

  const categoryLines=cats.length?cats.map(([cat,amt])=>{
    const pct=expense?Math.round(amt/expense*100):0;
    return `<div class="report-line"><span>${esc(cat)} <span class="pct">${pct}%</span></span><strong>${euro(amt)}</strong></div>`
  }).join(""):'<div class="tagline">Išlaidų nėra.</div>';

  const txRows=rows.length?rows.map(t=>`
    <tr>
      <td>${formatDate(t.date)}</td>
      <td>${esc(t.name)}</td>
      <td>${esc(t.category)}</td>
      <td>${esc(t.child||"—")}</td>
      <td>${esc(t.payer||"—")}</td>
      <td>${t.type==="expense"?"−":"+"}${euro(t.amount)}</td>
    </tr>`).join(""):'<tr><td colspan="6">Įrašų nėra.</td></tr>';

  return `
    <div class="report-title">Šeimos pinigai</div>
    <div class="report-period">${monthLabel($("monthInput").value)}</div>

    <div class="report-kpis">
      <div class="report-kpi"><span>Pajamos</span><strong style="color:var(--green)">${euro(income)}</strong></div>
      <div class="report-kpi"><span>Išlaidos</span><strong style="color:var(--red)">${euro(expense)}</strong></div>
      <div class="report-kpi"><span>Likutis</span><strong style="color:var(--blue)">${euro(balance)}</strong></div>
    </div>

    <div class="report-section">
      <h3>Išlaidos pagal kategorijas</h3>
      ${categoryLines}
    </div>

    <div class="report-section">
      <h3>Kas mokėjo</h3>
      <div class="report-line"><span>Aš</span><strong>${euro(pay["Aš"])}</strong></div>
      <div class="report-line"><span>Vyras</span><strong>${euro(pay["Vyras"])}</strong></div>
      <div class="report-line"><span>Bendri pinigai</span><strong>${euro(pay["Bendri pinigai"])}</strong></div>
    </div>

    <div class="report-section">
      <h3>Poreikiai</h3>
      <div class="report-line"><span>Mano poreikiai</span><strong>${euro(my)}</strong></div>
      <div class="report-line"><span>Vyro poreikiai</span><strong>${euro(his)}</strong></div>
      <div class="report-line"><span>Vaikų poreikiai iš viso</span><strong>${euro(childrenTotal)}</strong></div>
      ${childLines}
    </div>

    <div class="report-section">
      <h3>Visos mėnesio operacijos</h3>
      <div class="report-table-wrap">
        <table class="report-table">
          <thead><tr><th>Data</th><th>Pavadinimas</th><th>Kategorija</th><th>Vaikas</th><th>Kas mokėjo</th><th>Suma</th></tr></thead>
          <tbody>${txRows}</tbody>
        </table>
      </div>
    </div>`;
}
function openMonthlyReport(){
  const content=reportHtml();
  $("reportPreview").innerHTML=content;
  $("printReportContent").innerHTML=content;
  $("reportDialog").showModal()
}
function printMonthlyReport(){
  $("printReportContent").innerHTML=reportHtml();
  document.body.classList.add("printing-report");
  window.print()
}
window.addEventListener("afterprint",()=>document.body.classList.remove("printing-report"));
