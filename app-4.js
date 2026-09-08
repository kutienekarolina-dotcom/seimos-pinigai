function setupPwaInstall(){
  const btn=$("installAppBtn");
  const status=$("installStatus");
  if(!btn)return;

  window.addEventListener("beforeinstallprompt",event=>{
    event.preventDefault();
    deferredInstallPrompt=event;
    btn.disabled=false;
    btn.textContent="Įdiegti „Šeimos pinigai“";
    status.textContent="Programėlę jau galima įdiegti šiame įrenginyje."
  });

  window.addEventListener("appinstalled",()=>{
    deferredInstallPrompt=null;
    btn.disabled=true;
    btn.textContent="Programėlė įdiegta";
    status.textContent="Įdiegta sėkmingai."
  });

  btn.addEventListener("click",async()=>{
    if(!deferredInstallPrompt){
      status.textContent="Įdiegimas aktyvuosis, kai programėlė bus atidaryta per HTTPS ir naršyklė leis PWA diegimą.";
      return
    }
    deferredInstallPrompt.prompt();
    const choice=await deferredInstallPrompt.userChoice;
    if(choice?.outcome==="accepted")status.textContent="Diegimas patvirtintas.";
    else status.textContent="Diegimas atšauktas.";
    deferredInstallPrompt=null
  })
}
async function initApp(){
  transactions=await loadTransactionsFromDb();
  render();

  if("serviceWorker" in navigator && (location.protocol==="https:" || location.hostname==="localhost")){
    navigator.serviceWorker.register("./sw.js").catch(()=>{})
  }
  setupPwaInstall()
}

$("monthInput").value=thisMonth();
$("dateInput").value=today();
$("prevMonth").addEventListener("click",()=>shiftMonth(-1));
$("nextMonth").addEventListener("click",()=>shiftMonth(1));
$("monthInput").addEventListener("change",render);
$("addExpenseBtn").addEventListener("click",()=>openEntry("expense"));
$("addIncomeBtn").addEventListener("click",()=>openEntry("income"));
$("closeDialogBtn").addEventListener("click",closeEntry);
$("cancelBtn").addEventListener("click",closeEntry);
$("entryForm").addEventListener("submit",submitEntry);
$("cancelDeleteBtn").addEventListener("click",()=>{$("deleteDialog").close();deleteId=null});
$("confirmDeleteBtn").addEventListener("click",doDelete);
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.go)));
$("searchInput").addEventListener("input",renderTransactions);
$("filterCategory").addEventListener("change",renderTransactions);
$("filterType").addEventListener("change",renderTransactions);
$("filterChild").addEventListener("change",renderTransactions);
$("categoryInput").addEventListener("change",updateChildField);
$("exportCsvBtn").addEventListener("click",exportCsv);
$("importCsvInput").addEventListener("change",e=>{const f=e.target.files?.[0];if(f)importCsv(f);e.target.value=""});

$("bankCsvInput").addEventListener("change",e=>{
  const f=e.target.files?.[0];
  if(f)loadBankCsv(f);
  e.target.value="";
});
$("refreshBankPreviewBtn").addEventListener("click",refreshBankPreview);
$("selectAllBankBtn").addEventListener("click",()=>{
  bankPreviewRows.forEach(r=>r.selected=true);renderBankPreview()
});
$("deselectAllBankBtn").addEventListener("click",()=>{
  bankPreviewRows.forEach(r=>r.selected=false);renderBankPreview()
});
$("confirmBankImportBtn").addEventListener("click",confirmBankImport);

$("bankPdfInput").addEventListener("change",e=>{
  const f=e.target.files?.[0];
  if(f)loadBankPdf(f);
  e.target.value="";
});
$("selectAllPdfBtn").addEventListener("click",()=>{
  pdfPreviewRows.forEach(r=>r.selected=true);renderPdfPreview()
});
$("deselectAllPdfBtn").addEventListener("click",()=>{
  pdfPreviewRows.forEach(r=>r.selected=false);renderPdfPreview()
});
$("confirmPdfImportBtn").addEventListener("click",confirmPdfImport);

$("openReportBtn").addEventListener("click",openMonthlyReport);
$("closeReportBtn").addEventListener("click",()=>$("reportDialog").close());
$("reportCloseBtn").addEventListener("click",()=>$("reportDialog").close());
$("reportPrintBtn").addEventListener("click",printMonthlyReport);

document.querySelectorAll(".child-card[data-child]").forEach(btn=>{
  btn.addEventListener("click",()=>openChildDetails(btn.dataset.child));
});
$("closeChildDetailsBtn").addEventListener("click",()=>$("childDetailsDialog").close());

initApp();
