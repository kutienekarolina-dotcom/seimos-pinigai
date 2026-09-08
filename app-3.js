function pdfDateFromText(s){
  const matches=String(s||"").match(/\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/g)||[];
  for(const m of matches){
    const p=parseBankDate(m);
    if(p)return p
  }
  return ""
}
function moneyTokens(line){
  const rx=/[+-]?\s*\d{1,3}(?:[ .]\d{3})*(?:[,.]\d{2})|[+-]?\s*\d+(?:[,.]\d{2})/g;
  return [...String(line).matchAll(rx)].map(m=>({raw:m[0],index:m.index||0,value:parseMoney(m[0])})).filter(x=>Number.isFinite(x.value))
}
function inferPdfType(line,token){
  const raw=String(token?.raw||"").replace(/\s/g,"");
  if(raw.startsWith("-"))return "expense";
  if(raw.startsWith("+"))return "income";
  const n=normalizeHeader(line);
  const incomeWords=["iplauka","gauta","pajamos","alga","ismoka","kreditas","credit","income","pervesta jums"];
  if(incomeWords.some(w=>n.includes(w)))return "income";
  return "expense"
}
function parsePdfLinesToOperations(lines){
  const ops=[];
  for(let i=0;i<lines.length;i++){
    const line=String(lines[i]||"").replace(/\s+/g," ").trim();
    const date=pdfDateFromText(line);
    if(!date)continue;

    const tokens=moneyTokens(line);
    if(!tokens.length)continue;

    let token=tokens.find(t=>/^[+-]/.test(t.raw.replace(/\s/g,"")));
    if(!token){
      token=tokens[0]
    }
    const type=inferPdfType(line,token);
    const amount=Math.abs(token.value);
    if(!(amount>0))continue;

    let desc=line
      .replace(/\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/g," ")
      .replace(token.raw," ")
      .replace(/\bEUR\b/gi," ")
      .replace(/\s+/g," ").trim();

    const next=String(lines[i+1]||"").replace(/\s+/g," ").trim();
    if(next && !pdfDateFromText(next) && next.length<160 && !/^\s*(lapas|page)\b/i.test(next)){
      if(!moneyTokens(next).length)desc=`${desc} ${next}`.trim()
    }

    if(desc.length<2)desc="Banko operacija";
    ops.push({
      sourceIndex:i,date,desc,type,amount,
      category:autoCategory(desc,type),selected:true
    })
  }

  const seen=new Set();
  return ops.filter(o=>{
    const k=[o.date,o.amount.toFixed(2),normalizeMerchant(o.desc),o.type].join("|");
    if(seen.has(k))return false;
    seen.add(k);return true
  }).slice(0,500)
}
async function extractPdfLines(file){
  if(!window.pdfjsLib)throw new Error("PDF skaitymo modulis neužsikrovė. Patikrink interneto ryšį ir atidaryk programėlę iš naujo.");
  pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const data=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data}).promise;
  const allLines=[];

  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const content=await page.getTextContent();
    const items=content.items
      .filter(x=>String(x.str||"").trim())
      .map(x=>({text:String(x.str).trim(),x:x.transform?.[4]||0,y:x.transform?.[5]||0}))
      .sort((a,b)=>Math.abs(b.y-a.y)>2?b.y-a.y:a.x-b.x);

    const groups=[];
    for(const item of items){
      let g=groups.find(g=>Math.abs(g.y-item.y)<=2.5);
      if(!g){g={y:item.y,items:[]};groups.push(g)}
      g.items.push(item)
    }
    groups.sort((a,b)=>b.y-a.y);
    groups.forEach(g=>{
      g.items.sort((a,b)=>a.x-b.x);
      const line=g.items.map(i=>i.text).join(" ").replace(/\s+/g," ").trim();
      if(line)allLines.push(line)
    })
  }
  return allLines
}
function renderPdfPreview(){
  const box=$("bankPdfPreview");
  box.innerHTML="";
  $("bankPdfCount").textContent=String(pdfPreviewRows.length);

  if(!pdfPreviewRows.length){
    box.innerHTML='<div class="tagline">Automatiškai operacijų rasti nepavyko. Tikėtina, kad PDF struktūra kitokia arba dokumentas nuskenuotas kaip vaizdas.</div>';
    return
  }

  pdfPreviewRows.forEach((r,i)=>{
    const cats=r.type==="expense"?expenseCategories:incomeCategories;
    const el=document.createElement("div");el.className="import-row";
    el.innerHTML=`
      <input class="pdf-check" type="checkbox" data-i="${i}" ${r.selected?"checked":""}>
      <div class="import-main">
        <div class="import-desc">${esc(r.desc)}</div>
        <div class="import-meta">${formatDate(r.date)}</div>
        <select class="pdf-type" data-i="${i}">
          <option value="expense" ${r.type==="expense"?"selected":""}>Išlaida</option>
          <option value="income" ${r.type==="income"?"selected":""}>Pajamos</option>
        </select>
        <select class="pdf-cat" data-i="${i}">
          ${cats.map(c=>`<option ${c===r.category?"selected":""}>${esc(c)}</option>`).join("")}
        </select>
      </div>
      <div class="import-amt ${r.type}">${r.type==="expense"?"−":"+"}${euro(r.amount)}</div>`;
    box.appendChild(el)
  });

  box.querySelectorAll(".pdf-check").forEach(ch=>ch.addEventListener("change",()=>{
    pdfPreviewRows[Number(ch.dataset.i)].selected=ch.checked
  }));
  box.querySelectorAll(".pdf-cat").forEach(sel=>sel.addEventListener("change",()=>{
    pdfPreviewRows[Number(sel.dataset.i)].category=sel.value
  }));
  box.querySelectorAll(".pdf-type").forEach(sel=>sel.addEventListener("change",()=>{
    const i=Number(sel.dataset.i),r=pdfPreviewRows[i];
    r.type=sel.value;
    const allowed=r.type==="expense"?expenseCategories:incomeCategories;
    r.category=autoCategory(r.desc,r.type);
    if(!allowed.includes(r.category))r.category=allowed[0];
    renderPdfPreview()
  }))
}
async function loadBankPdf(file){
  const status=$("bankPdfStatus");
  try{
    status.textContent="Skaitau PDF…";
    const lines=await extractPdfLines(file);
    if(!lines.length)throw new Error("PDF neturi nuskaitomo tekstinio sluoksnio.");
    pdfPreviewRows=parsePdfLinesToOperations(lines);
    $("bankPdfBox").classList.remove("hidden");
    status.textContent=`PDF perskaitytas. Teksto eilučių: ${lines.length}.`;
    renderPdfPreview()
  }catch(e){
    pdfPreviewRows=[];
    $("bankPdfBox").classList.add("hidden");
    status.textContent=e.message||"PDF nuskaityti nepavyko."
  }
}
function confirmPdfImport(){
  const selected=pdfPreviewRows.filter(r=>r.selected);
  if(!selected.length){$("bankPdfStatus").textContent="Nepažymėta nė viena operacija.";return}
  const existing=new Set(transactions.map(makeBankDedupKey));
  let added=0,skipped=0;
  selected.forEach(r=>{
    const rec={
      id:`pdf-${Date.now()}-${r.sourceIndex}-${Math.random()}`,
      type:r.type,
      amount:Math.round(r.amount*100)/100,
      date:r.date,
      name:r.desc,
      category:r.category,
      child:"",
      payer:r.type==="expense"?"Bendri pinigai":"",
      note:"Importuota iš banko PDF",
      createdAt:Date.now()+r.sourceIndex,
      updatedAt:Date.now()
    };
    const key=makeBankDedupKey(rec);
    if(existing.has(key)){skipped++;return}
    transactions.push(rec);existing.add(key);added++;
    if(r.type==="expense"&&r.category!=="Kita"){
      const merchant=normalizeMerchant(r.desc);
      const useful=merchant.split(" ").filter(x=>x.length>=4).slice(0,2).join(" ");
      if(useful)bankRules[useful]=r.category
    }
  });
  save();saveBankRules();
  if(added&&selected[0]?.date)$("monthInput").value=selected[0].date.slice(0,7);
  render();
  $("bankPdfStatus").textContent=`Importuota ${added} operacijų${skipped?`, praleista pasikartojančių: ${skipped}`:""}.`
}

async function loadBankCsv(file){
  const status=$("bankImportStatus");
  try{
    let text=(await file.text()).replace(/^\uFEFF/,"");
    bankDelimiter=detectDelimiter(text);
    const rows=parseDelimited(text,bankDelimiter);
    if(rows.length<2)throw new Error("CSV faile nerasta duomenų.");
    bankHeaders=rows[0].map((h,i)=>h||`Stulpelis ${i+1}`);
    bankRawRows=rows.slice(1).filter(r=>r.some(x=>String(x).trim()!==""));
    guessBankMappings();
    $("bankImportBox").classList.remove("hidden");
    status.textContent=`Failas nuskaitytas. Rasta eilučių: ${bankRawRows.length}.`;
    refreshBankPreview()
  }catch(e){
    bankRawRows=[];bankPreviewRows=[];
    $("bankImportBox").classList.add("hidden");
    status.textContent=e.message||"Nepavyko nuskaityti banko CSV."
  }
}
async function importCsv(file){
  const msg=$("importMessage");
  try{
    const rows=parseCsv((await file.text()).replace(/^\uFEFF/,""));if(rows.length<2)throw new Error("Failas tuščias.");
    const h=rows[0],idx=Object.fromEntries(h.map((x,i)=>[x,i])),req=["id","type","date","amount","name","category","payer","note"];
    if(!req.every(x=>x in idx))throw new Error("Netinkamas CSV formatas.");
    const imported=rows.slice(1).map(r=>({id:r[idx.id],type:r[idx.type],date:r[idx.date],amount:Number(r[idx.amount]),name:r[idx.name],category:r[idx.category],child:("child" in idx ? r[idx.child] : ""),payer:r[idx.payer],note:r[idx.note],createdAt:Number(r[idx.createdAt])||Date.now(),updatedAt:Number(r[idx.updatedAt])||Date.now()})).filter(t=>["income","expense"].includes(t.type)&&t.name&&Number.isFinite(t.amount));
    const map=new Map(transactions.map(t=>[String(t.id),t]));imported.forEach(t=>map.set(String(t.id),t));transactions=[...map.values()];save();render();msg.textContent=`Importuota: ${imported.length} įrašų.`
  }catch(e){msg.textContent=e.message||"Importuoti nepavyko."}
}
