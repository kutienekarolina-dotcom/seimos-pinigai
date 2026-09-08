function detectDelimiter(text){
  const sample=text.split(/\r?\n/).slice(0,8).join("\n");
  const counts={
    ";":(sample.match(/;/g)||[]).length,
    ",":(sample.match(/,/g)||[]).length,
    "\t":(sample.match(/\t/g)||[]).length
  };
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0] || ",";
}
function parseDelimited(text,delimiter=","){
  const rows=[];let row=[],cell="",q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(c=='"'&&q&&n=='"'){cell+='"';i++}
    else if(c=='"'){q=!q}
    else if(c===delimiter&&!q){row.push(cell.trim());cell=""}
    else if((c=="\n"||c=="\r")&&!q){
      if(c=="\r"&&n=="\n")i++;
      row.push(cell.trim());
      if(row.some(x=>x!==""))rows.push(row);
      row=[];cell=""
    } else cell+=c
  }
  row.push(cell.trim());
  if(row.some(x=>x!==""))rows.push(row);
  return rows
}
function parseCsv(text){
  return parseDelimited(text, detectDelimiter(text));
}
function normalizeHeader(v=""){
  return String(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim()
}
function findHeaderIndex(patterns){
  const normalized=bankHeaders.map(normalizeHeader);
  for(const p of patterns){
    const idx=normalized.findIndex(h=>h.includes(p));
    if(idx>=0)return idx
  }
  return -1
}
function fillMappingSelect(selectId,guessIndex,allowEmpty=true){
  const sel=$(selectId);
  sel.innerHTML=allowEmpty?'<option value="">— nenaudoti —</option>':'';
  bankHeaders.forEach((h,i)=>{
    const o=document.createElement("option");
    o.value=String(i);o.textContent=h||`Stulpelis ${i+1}`;
    if(i===guessIndex)o.selected=true;
    sel.appendChild(o)
  });
}
function guessBankMappings(){
  const dateIdx=findHeaderIndex(["data","date","operacijos data","booking date","transaction date"]);
  const descIdx=findHeaderIndex(["gavėjas","gavejas","mokėjimo paskirtis","mokejimo paskirtis","aprašymas","aprasymas","description","details","merchant","partneris","kontrahentas"]);
  const amountIdx=findHeaderIndex(["suma","amount","transaction amount"]);
  const debitIdx=findHeaderIndex(["debetas","debit","išlaidos","islaidos","nurašyta","nurasyta"]);
  const creditIdx=findHeaderIndex(["kreditas","credit","pajamos","įplaukos","iplaukos"]);
  fillMappingSelect("mapDate",dateIdx,false);
  fillMappingSelect("mapDescription",descIdx,false);
  fillMappingSelect("mapAmount",amountIdx,true);
  fillMappingSelect("mapDebit",debitIdx,true);
  fillMappingSelect("mapCredit",creditIdx,true);
}
function parseMoney(value){
  if(value===null||value===undefined)return NaN;
  let s=String(value).trim().replace(/\s/g,"").replace(/[€$£]/g,"");
  if(!s)return NaN;
  if(s.includes(",")&&s.includes(".")){
    if(s.lastIndexOf(",")>s.lastIndexOf("."))s=s.replace(/\./g,"").replace(",",".");
    else s=s.replace(/,/g,"")
  }else if(s.includes(",")){
    s=s.replace(",",".")
  }
  s=s.replace(/[^\d.-]/g,"");
  const n=Number(s);
  return Number.isFinite(n)?n:NaN
}
function parseBankDate(value){
  const s=String(value||"").trim();
  if(!s)return "";
  let m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if(m)return `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;
  m=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if(m)return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
  return ""
}
function normalizeMerchant(desc=""){
  return String(desc).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\b(lt|lithuania|uab|mb|ab)\b/g," ")
    .replace(/[0-9*#/_-]+/g," ")
    .replace(/\s+/g," ").trim()
}
function autoCategory(desc,type){
  if(type==="income")return "Kitos pajamos";
  const d=normalizeMerchant(desc);
  for(const [key,cat] of Object.entries(bankRules)){
    if(key && d.includes(key))return cat
  }
  const rules=[
    [["maxima","lidl","iki","rimi","norfa","aibe","barbora"],"Maistas"],
    [["circle k","viada","orlen","baltic petroleum","neste"],"Kuras / automobilis"],
    [["eurovaistine","eurovaistin","benu","camelia","gintarine vaistine","vaistine"],"Sveikata / vaistinė"],
    [["knygos","pegasas","vaga","mokykla","darzel","darž","pratyb"],"Vaikai / mokykla / darželis"],
    [["telia","tele2","bite","ignitis","elektrum","vanduo","komunal"],"Mokesčiai"],
    [["netflix","spotify","youtube premium","google one","icloud"],"Prenumeratos"]
  ];
  for(const [keys,cat] of rules)if(keys.some(k=>d.includes(k)))return cat;
  return "Kita"
}
function bankRowToPreview(row,index){
  const di=Number($("mapDate").value),xi=Number($("mapDescription").value);
  const ai=$("mapAmount").value===""?null:Number($("mapAmount").value);
  const debi=$("mapDebit").value===""?null:Number($("mapDebit").value);
  const cri=$("mapCredit").value===""?null:Number($("mapCredit").value);

  const date=parseBankDate(row[di]);
  const desc=(row[xi]||"Banko operacija").trim();

  let amount=NaN,type="expense";
  if(ai!==null){
    const n=parseMoney(row[ai]);
    if(Number.isFinite(n)){type=n<0?"expense":"income";amount=Math.abs(n)}
  }else{
    const debit=debi!==null?parseMoney(row[debi]):NaN;
    const credit=cri!==null?parseMoney(row[cri]):NaN;
    if(Number.isFinite(debit)&&Math.abs(debit)>0){type="expense";amount=Math.abs(debit)}
    else if(Number.isFinite(credit)&&Math.abs(credit)>0){type="income";amount=Math.abs(credit)}
  }
  if(!date||!Number.isFinite(amount)||amount<=0)return null;
  return {
    sourceIndex:index,date,desc,type,amount,
    category:autoCategory(desc,type),
    selected:true
  }
}
function refreshBankPreview(){
  bankPreviewRows=bankRawRows.map((r,i)=>bankRowToPreview(r,i)).filter(Boolean).slice(0,500);
  renderBankPreview()
}
function renderBankPreview(){
  const box=$("bankPreview");
  box.innerHTML="";
  $("bankPreviewCount").textContent=String(bankPreviewRows.length);

  if(!bankPreviewRows.length){
    box.innerHTML='<div class="tagline">Nepavyko atpažinti operacijų. Patikrink stulpelių pasirinkimą.</div>';
    return
  }

  bankPreviewRows.forEach((r,i)=>{
    const cats=r.type==="expense"?expenseCategories:incomeCategories;
    const el=document.createElement("div");el.className="import-row";
    el.innerHTML=`
      <input class="bank-check" type="checkbox" data-i="${i}" ${r.selected?"checked":""}>
      <div class="import-main">
        <div class="import-desc">${esc(r.desc)}</div>
        <div class="import-meta">${formatDate(r.date)} · ${r.type==="expense"?"Išlaida":"Pajamos"}</div>
        <select class="bank-cat" data-i="${i}">
          ${cats.map(c=>`<option ${c===r.category?"selected":""}>${esc(c)}</option>`).join("")}
        </select>
      </div>
      <div class="import-amt ${r.type}">${r.type==="expense"?"−":"+"}${euro(r.amount)}</div>`;
    box.appendChild(el)
  });

  box.querySelectorAll(".bank-check").forEach(ch=>ch.addEventListener("change",()=>{
    bankPreviewRows[Number(ch.dataset.i)].selected=ch.checked
  }));
  box.querySelectorAll(".bank-cat").forEach(sel=>sel.addEventListener("change",()=>{
    bankPreviewRows[Number(sel.dataset.i)].category=sel.value
  }))
}
function makeBankDedupKey(t){
  return [t.date,Number(t.amount).toFixed(2),String(t.name||"").trim().toLowerCase(),t.type].join("|")
}
function confirmBankImport(){
  const selected=bankPreviewRows.filter(r=>r.selected);
  if(!selected.length){$("bankImportStatus").textContent="Nepažymėta nė viena operacija.";return}

  const existing=new Set(transactions.map(makeBankDedupKey));
  let added=0,skipped=0;
  selected.forEach(r=>{
    const rec={
      id:`bank-${Date.now()}-${r.sourceIndex}-${Math.random()}`,
      type:r.type,
      amount:Math.round(r.amount*100)/100,
      date:r.date,
      name:r.desc,
      category:r.category,
      child:"",
      payer:r.type==="expense"?"Bendri pinigai":"",
      note:"Importuota iš banko CSV",
      createdAt:Date.now()+r.sourceIndex,
      updatedAt:Date.now()
    };
    const key=makeBankDedupKey(rec);
    if(existing.has(key)){skipped++;return}
    transactions.push(rec);existing.add(key);added++;

    if(r.type==="expense" && r.category!=="Kita"){
      const merchant=normalizeMerchant(r.desc);
      const useful=merchant.split(" ").filter(x=>x.length>=4).slice(0,2).join(" ");
      if(useful)bankRules[useful]=r.category
    }
  });

  save();saveBankRules();render();
  $("bankImportStatus").textContent=`Importuota ${added} operacijų${skipped?`, praleista pasikartojančių: ${skipped}`:""}.`;
  if(added && selected[0]?.date)$("monthInput").value=selected[0].date.slice(0,7);
  render()
}
