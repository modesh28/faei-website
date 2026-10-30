// Order log for the cafeteria site (optional; the admin panel already keeps orders). Paste this into Extensions > Apps Script in the orders Google Sheet,
// run "setup" once, then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).

const ORDERS = 'الطلبات';
const DAILY = 'ملخص يومي';
const HEADERS = ['التاريخ', 'الساعة', 'رقم الطلب', 'الأصناف', 'عدد القطع', 'مجموع الأصناف', 'التوصيل', 'الإجمالي',
  'الاستلام', 'العنوان', 'الوقت المطلوب', 'الدفع', 'من الكافتيريا', 'المصدر', 'الحالة'];

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Asia/Amman');
  const orders = ss.getSheetByName(ORDERS) || ss.insertSheet(ORDERS, 0);
  orders.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#14273a').setFontColor('#ffffff');
  orders.setFrozenRows(1);
  orders.getRange('A:A').setNumberFormat('@');
  orders.getRange('C:C').setNumberFormat('@');
  orders.setRightToLeft(true);
  // Staff mark each order here. "جاهز" tells the customer's phone the order is ready;
  // only "تم" counts as a real sale in the daily summary.
  orders.getRange('O2:O').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['جاهز', 'تم', 'ملغي'], true).build());

  const daily = ss.getSheetByName(DAILY) || ss.insertSheet(DAILY, 1);
  daily.clear();
  daily.setRightToLeft(true);
  daily.getRange('A1').setFormula(
    "=QUERY('" + ORDERS + "'!A:O, \"select A, count(C), sum(H), sum(E) where A is not null and (O is null or O <> 'ملغي') group by A order by A desc " +
    "label count(C) 'كل الطلبات', sum(H) 'مجموع المبالغ (د.أ)', sum(E) 'عدد القطع'\", 1)");
  daily.getRange('F1').setValue('مبيعات مؤكدة (تم) اليوم');
  daily.getRange('F2').setFormula("=SUMIFS('" + ORDERS + "'!H:H, '" + ORDERS + "'!A:A, TEXT(TODAY(), \"yyyy-mm-dd\"), '" + ORDERS + "'!O:O, \"تم\")");
  daily.getRange('A1:F1').setFontWeight('bold');
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const o = JSON.parse(e.postData.contents);
    const clip = (v) => String(v == null ? '' : v).slice(0, 500);
    const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 && v < 1000 ? v : clip(v));
    const now = new Date();
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORDERS).appendRow([
      Utilities.formatDate(now, 'Asia/Amman', 'yyyy-MM-dd'),
      Utilities.formatDate(now, 'Asia/Amman', 'HH:mm'),
      clip(o.orderId), clip(o.items), num(o.pieces), num(o.itemsTotal), num(o.delivery), num(o.total),
      clip(o.fulfillment), clip(o.address), clip(o.time), clip(o.payment), clip(o.extras), clip(o.source), '',
    ]);
    return ContentService.createTextOutput('ok');
  } finally {
    lock.releaseLock();
  }
}

// The website asks here whether an order is ready: ?id=1834-52 → {"status":"جاهز"}.
function doGet(e) {
  const id = String((e && e.parameter && e.parameter.id) || '').slice(0, 20);
  let status = '';
  if (id) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORDERS);
    const last = sheet.getLastRow();
    if (last >= 2) {
      const start = Math.max(2, last - 300);
      const rows = sheet.getRange(start, 3, last - start + 1, 13).getDisplayValues();
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i][0] === id) { status = rows[i][12]; break; }
      }
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ status: status })).setMimeType(ContentService.MimeType.JSON);
}
