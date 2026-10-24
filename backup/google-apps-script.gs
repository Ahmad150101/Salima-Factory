const TIMEZONE = 'Asia/Hebron';
const PRIMARY_GREEN = '#176B4D';
const DARK_GREEN = '#0D4F3C';
const LIGHT_GREEN = '#EAF5F0';
const WHITE = '#FFFFFF';
const SHEETS = Object.freeze({
  dashboard: 'لوحة التحكم', daily: 'الملخص اليومي', production: 'الإنتاج', rolls: 'الرولات المستخدمة',
  shipments: 'الشحنات', products: 'المنتجات', activity: 'سجل النشاط', users: 'المستخدمون', permissions: 'الصلاحيات',
  productionBackup: 'Production Backup',
});

function runDailyExport() {
  const properties = PropertiesService.getScriptProperties();
  const endpoint = properties.getProperty('DAILY_EXPORT_URL');
  const token = properties.getProperty('DAILY_SYNC_TOKEN');
  const publishableKey = properties.getProperty('SUPABASE_PUBLISHABLE_KEY');
  if (!endpoint || !token || !publishableKey) throw new Error('خصائص الاتصال بالنسخ الاحتياطي غير مكتملة');

  const response = UrlFetchApp.fetch(endpoint, {
    method: 'post', contentType: 'application/json',
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
    payload: JSON.stringify({ token }), muteHttpExceptions: true,
  });
  const responseText = response.getContentText();
  if (response.getResponseCode() !== 200) throw new Error(`daily-export ${response.getResponseCode()}: ${responseText}`);
  const payload = JSON.parse(responseText);
  validatePayload(payload);

  const model = buildBackupModel(payload);
  updateWorkbook(SpreadsheetApp.getActiveSpreadsheet(), model);
  const xlsxFile = createOrUpdateExcelBackup();

  const completedAt = new Date().toISOString();
  properties.setProperty('LAST_SYNC_AT', completedAt);
  properties.setProperty('XLSX_FILE_ID', xlsxFile.getId());
  return {
    ok: true, generatedAt: payload.generated_at || '', completedAt,
    production: payload.production.length, shipments: payload.shipments.length,
    products: payload.products.length, users: payload.profiles.length,
    permissions: payload.permissions.length, xlsxFileId: xlsxFile.getId(),
  };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid daily-export response: expected object');
  ['products', 'production', 'shipments', 'activity', 'profiles', 'permissions'].forEach(key => {
    if (!Array.isArray(payload[key])) throw new Error(`Invalid daily-export response: ${key} must be an array`);
  });
}

function buildBackupModel(payload) {
  const profileNames = new Map(payload.profiles.map(profile => [String(profile.id), profile.full_name || profile.username || '—']));
  const productionRows = buildProductionRows(payload.production, profileNames);
  return {
    generatedAt: payload.generated_at || '',
    dashboard: buildDashboardRows(payload, productionRows),
    daily: buildDailySummaryRows(productionRows), production: productionRows,
    rolls: buildRollRows(payload.production, profileNames), shipments: buildShipmentRows(payload.shipments, profileNames),
    products: buildProductRows(payload.products, profileNames), activity: buildActivityRows(payload.activity, profileNames),
    users: buildUserRows(payload.profiles), permissions: buildPermissionRows(payload.permissions, profileNames),
  };
}

function normalizeNylonItems(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => ({
    name: String((item && (item.name || item.type)) || '').trim(),
    weight_kg: Math.max(0, Number(item && item.weight_kg || 0)),
    quantity: Math.max(0, Number(item && item.quantity || 0)),
  })).filter(item => item.name);
}

function nylonTotals(value) {
  const items = normalizeNylonItems(value);
  return {
    weight: round2(items.reduce((sum, item) => sum + item.weight_kg, 0)),
    quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    details: items.map(item => `${item.name}: ${formatPlainNumber(item.weight_kg)} كغم × ${formatPlainNumber(item.quantity)}`).join(' | '),
  };
}

function productSnapshot(record) {
  return record && record.product_snapshot && typeof record.product_snapshot === 'object' ? record.product_snapshot : {};
}

function outputTotals(record) {
  const product = productSnapshot(record);
  const pallets = Number(record.pallets || 0);
  const extraBags = Number(record.extra_bags || 0);
  const bags = pallets * Number(product.bagsPerPallet || product.bags_per_pallet || 0) + extraBags;
  const packs = bags * Number(product.packsPerBag || product.packs_per_bag || 0);
  const units = packs * Number(product.unitsPerPack || product.units_per_pack || 0);
  return { bags, packs, units, weight: round2(units * Number(product.unitWeightKg || product.unit_weight_kg || 0)) };
}

function buildProductionRows(records, profileNames) {
  return records.map(record => {
    const product = productSnapshot(record);
    const output = outputTotals(record);
    const transparent = nylonTotals(record.transparent_nylon_items);
    const printed = nylonTotals(record.printed_nylon_items);
    return {
      id: record.id || '', date: record.production_date || '', shift: record.shift || '', productId: record.product_id || '', product: product.name || '—',
      pallets: Number(record.pallets || 0), extraBags: Number(record.extra_bags || 0), bags: output.bags,
      packs: output.packs, units: output.units, outputWeight: output.weight,
      rollsText: readableRolls(record.rolls),
      transparentDetails: transparent.details, transparentWeight: transparent.weight, transparentQuantity: transparent.quantity,
      printedDetails: printed.details, printedWeight: printed.weight, printedQuantity: printed.quantity,
      wasteDescription: record.waste_type || '', wasteWeight: Number(record.waste_weight || 0), notes: record.notes || '',
      createdById: record.created_by || '', createdBy: profileNames.get(String(record.created_by || '')) || '—',
      updatedById: record.updated_by || '', updatedBy: profileNames.get(String(record.updated_by || '')) || '',
      createdAt: record.created_at || '', updatedAt: record.updated_at || '',
    };
  });
}

function buildRollRows(records, profileNames) {
  const rows = [];
  records.forEach(record => {
    const product = productSnapshot(record);
    const rolls = Array.isArray(record.rolls) ? record.rolls : [];
    rolls.forEach((roll, index) => rows.push([
      record.id || '', record.production_date || '', record.shift || '', product.name || '—', index + 1,
      roll.code || '', Number(roll.weight || 0), roll.note || '', profileNames.get(String(record.created_by || '')) || '—', record.created_at || '',
    ]));
  });
  return rows;
}

function buildDailySummaryRows(productionRows) {
  const days = new Map();
  productionRows.forEach(row => {
    const item = days.get(row.date) || { records: 0, pallets: 0, outputWeight: 0, transparentWeight: 0, transparentQuantity: 0, printedWeight: 0, printedQuantity: 0, waste: 0 };
    item.records += 1; item.pallets += row.pallets; item.outputWeight += row.outputWeight;
    item.transparentWeight += row.transparentWeight; item.transparentQuantity += row.transparentQuantity;
    item.printedWeight += row.printedWeight; item.printedQuantity += row.printedQuantity; item.waste += row.wasteWeight;
    days.set(row.date, item);
  });
  return Array.from(days.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([date, item]) => [
    date, item.records, item.pallets, round2(item.outputWeight), round2(item.transparentWeight), item.transparentQuantity,
    round2(item.printedWeight), item.printedQuantity, round2(item.waste),
  ]);
}

function buildDashboardRows(payload, productionRows) {
  const productionDates = productionRows.map(row => row.date).filter(Boolean).sort();
  return [
    ['آخر مزامنة', payload.generated_at || '—'], ['آخر يوم إنتاج', productionDates.length ? productionDates[productionDates.length - 1] : 'لا توجد بيانات'],
    ['إجمالي سجلات الإنتاج', payload.production.length], ['إجمالي الشحنات', payload.shipments.length],
    ['إجمالي المنتجات', payload.products.length], ['إجمالي المستخدمين', payload.profiles.length], ['حالة النسخة الاحتياطية', 'تمت المزامنة بنجاح'],
  ];
}

function buildShipmentRows(records, profileNames) {
  return records.map(row => [row.id || '',row.shipment_date || '',row.supplier || '',Number(row.container_count || 0),Number(row.roll_count || 0),Number(row.total_weight || 0),row.reference || '',row.notes || '',row.created_by || '',profileNames.get(String(row.created_by || '')) || '—',row.updated_by || '',profileNames.get(String(row.updated_by || '')) || '',row.created_at || '',row.updated_at || '']);
}

function buildProductRows(records, profileNames) {
  return records.map(row => [row.id || '',row.name || '',Number(row.bags_per_pallet || 0),Number(row.packs_per_bag || 0),Number(row.units_per_pack || 0),Number(row.unit_weight_kg || 0),row.is_active === true,row.created_by || '',profileNames.get(String(row.created_by || '')) || '—',row.updated_by || '',profileNames.get(String(row.updated_by || '')) || '',row.created_at || '',row.updated_at || '']);
}

function buildActivityRows(records, profileNames) {
  return records.map(row => [row.id || '',row.created_at || '',row.user_id || '',profileNames.get(String(row.user_id || '')) || 'النظام',row.action || '',row.entity_type || '',row.entity_id || '',readableValue(row.old_data),readableValue(row.new_data)]);
}

function buildUserRows(records) {
  return records.map(row => [row.id || '',row.username || '',row.full_name || '',row.role || '',row.is_active === true,row.created_at || '']);
}

function buildPermissionRows(records, profileNames) {
  return records.map(row => [row.user_id || '',profileNames.get(String(row.user_id || '')) || '—',row.permission_key || '',row.allowed === true,profileNames.get(String(row.updated_by || '')) || '',row.updated_at || '']);
}

function updateWorkbook(spreadsheet, model) {
  writeDashboard(spreadsheet, model.dashboard, model.generatedAt);
  writeTableSheet(spreadsheet, SHEETS.daily, ['التاريخ','عدد سجلات الإنتاج','إجمالي المشاتيح','وزن الإنتاج (كغم)','شفاف - الوزن','شفاف - العدد','مطبوع - الوزن','مطبوع - العدد','إجمالي التالف (كغم)'], model.daily, [1,4,5,7,9]);
  const productionHeaders = ['ID','التاريخ','الوردية','معرّف الصنف','الصنف التاريخي','المشاتيح','شوالات إضافية','الشوالات','الحبات','الحبات الصغيرة','وزن الإنتاج (كغم)','الرولات المستخدمة','شفاف - التفاصيل','شفاف - الوزن','شفاف - العدد','مطبوع - التفاصيل','مطبوع - الوزن','مطبوع - العدد','وصف التالف','وزن التالف','الملاحظات','معرّف المنشئ','أنشأه','معرّف المعدّل','عدّله','تاريخ الإنشاء','آخر تعديل'];
  const productionValues = model.production.map(row => Object.values(row));
  writeTableSheet(spreadsheet, SHEETS.production, productionHeaders, productionValues, [2,26,27]);
  writeTableSheet(spreadsheet, SHEETS.productionBackup, productionHeaders, productionValues, [2,26,27]);
  writeTableSheet(spreadsheet, SHEETS.rolls, ['معرّف سجل الإنتاج','التاريخ','الوردية','الصنف','ترتيب الرولة','كود الرولة','وزن الرولة (كغم)','ملاحظة الرولة','أنشأ السجل','تاريخ الإنشاء'], model.rolls, [2,7,10]);
  writeTableSheet(spreadsheet, SHEETS.shipments, ['ID','تاريخ الشحنة','المورد','الحاويات','الرولات','الوزن الإجمالي (كغم)','المرجع','الملاحظات','معرّف المنشئ','أنشأه','معرّف المعدّل','عدّله','تاريخ الإنشاء','آخر تعديل'], model.shipments, [2,6,13,14]);
  writeTableSheet(spreadsheet, SHEETS.products, ['ID','اسم المنتج','شوال/مشتاح','حبة/شوال','صغيرة/حبة','وزن الصغيرة (كغم)','نشط','معرّف المنشئ','أنشأه','معرّف المعدّل','عدّله','تاريخ الإنشاء','آخر تعديل'], model.products, [6,12,13]);
  writeTableSheet(spreadsheet, SHEETS.activity, ['ID','التاريخ','معرّف المستخدم','المستخدم','العملية','نوع الكيان','معرّف الكيان','قبل','بعد'], model.activity, [2]);
  writeTableSheet(spreadsheet, SHEETS.users, ['ID','اسم المستخدم','الاسم الكامل','الدور','نشط','تاريخ الإنشاء'], model.users, [6]);
  writeTableSheet(spreadsheet, SHEETS.permissions, ['معرّف المستخدم','المستخدم','مفتاح الصلاحية','مسموح','عدّلها','آخر تعديل'], model.permissions, [6]);
}

function writeDashboard(spreadsheet, rows, generatedAt) {
  const sheet = getOrCreateSheet(spreadsheet, SHEETS.dashboard);
  sheet.clear(); sheet.setRightToLeft(true); sheet.setHiddenGridlines(true);
  sheet.getRange('A1:D1').merge().setValue('لوحة النسخ الاحتياطي — مصنع سليمة').setBackground(DARK_GREEN).setFontColor(WHITE).setFontWeight('bold').setFontSize(18).setHorizontalAlignment('center');
  sheet.getRange('A2:D2').merge().setValue(`آخر توليد من الخادم: ${generatedAt || '—'}`).setBackground(LIGHT_GREEN).setFontColor(DARK_GREEN).setHorizontalAlignment('center');
  rows.forEach((row, index) => {
    const range = sheet.getRange(4 + index, 1, 1, 4);
    range.getCell(1,1).setValue(row[0]).setBackground(PRIMARY_GREEN).setFontColor(WHITE).setFontWeight('bold');
    sheet.getRange(4 + index,2,1,3).merge().setValue(row[1]).setBackground(index % 2 ? '#F7FBF9' : LIGHT_GREEN);
  });
  sheet.setColumnWidths(1, 1, 190); sheet.setColumnWidths(2, 3, 150); sheet.setFrozenRows(2);
}

function writeTableSheet(spreadsheet, name, headers, rows, dateColumns) {
  const sheet = getOrCreateSheet(spreadsheet, name);
  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  sheet.getBandings().forEach(banding => banding.remove());
  sheet.clear(); sheet.setRightToLeft(true); sheet.setHiddenGridlines(false);
  sheet.getRange(1,1,1,headers.length).setValues([headers]).setBackground(DARK_GREEN).setFontColor(WHITE).setFontWeight('bold').setHorizontalAlignment('center').setWrap(true);
  if (rows.length) {
    sheet.getRange(2,1,rows.length,headers.length).setValues(rows).setVerticalAlignment('middle').setWrap(true);
    sheet.getRange(2,1,rows.length,headers.length).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREEN, false, false);
  }
  sheet.setFrozenRows(1); sheet.getDataRange().setFontFamily('Arial').setHorizontalAlignment('right');
  sheet.getRange(1,1,Math.max(1, rows.length + 1),headers.length).createFilter();
  sheet.autoResizeColumns(1, headers.length);
  headers.forEach((header, index) => sheet.setColumnWidth(index + 1, /تفاصيل|ملاحظات|الرولات المستخدمة|قبل|بعد/.test(header) ? 280 : Math.max(110, Math.min(190, sheet.getColumnWidth(index + 1)))));
  (dateColumns || []).forEach(column => { if (rows.length) sheet.getRange(2,column,rows.length,1).setNumberFormat('yyyy-mm-dd hh:mm'); });
  const weightColumns = headers.map((header,index) => /وزن|كغم/.test(header) ? index + 1 : 0).filter(Boolean);
  weightColumns.forEach(column => { if (rows.length) sheet.getRange(2,column,rows.length,1).setNumberFormat('0.00'); });
}

function getOrCreateSheet(spreadsheet, name) { return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name); }

function createOrUpdateExcelBackup() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const exportResponse = UrlFetchApp.fetch(`https://docs.google.com/spreadsheets/d/${spreadsheet.getId()}/export?format=xlsx`, { headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` }, muteHttpExceptions: true });
  if (exportResponse.getResponseCode() !== 200) throw new Error(`Excel export failed: ${exportResponse.getResponseCode()}`);
  const blob = exportResponse.getBlob().setName('Salima Factory Backup.xlsx');
  const existingId = properties.getProperty('XLSX_FILE_ID');
  if (existingId) {
    const update = UrlFetchApp.fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingId)}?uploadType=media`, { method: 'patch', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', payload: blob.getBytes(), headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` }, muteHttpExceptions: true });
    if (update.getResponseCode() >= 200 && update.getResponseCode() < 300) return DriveApp.getFileById(existingId);
    throw new Error(`Excel update failed for XLSX_FILE_ID: ${update.getResponseCode()} ${update.getContentText()}`);
  }
  const folderId = properties.getProperty('BACKUP_FOLDER_ID');
  return (folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder()).createFile(blob);
}

function installDailyTrigger() {
  const triggers = ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === 'runDailyExport');
  if (!triggers.length) ScriptApp.newTrigger('runDailyExport').timeBased().everyDays(1).atHour(23).inTimezone(TIMEZONE).create();
  if (triggers.length > 1) throw new Error('يوجد أكثر من Trigger لـ runDailyExport؛ احذف الزائد يدويًا');
  return getDailyTriggerStatus();
}

function getDailyTriggerStatus() {
  const properties = PropertiesService.getScriptProperties();
  const triggers = ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === 'runDailyExport');
  return { exists: triggers.length === 1, count: triggers.length, handler: 'runDailyExport', timezone: TIMEZONE, cadence: 'يوميًا قرابة الساعة 23:00', lastSyncAt: properties.getProperty('LAST_SYNC_AT') || '', triggers: triggers.map(trigger => ({ id: trigger.getUniqueId(), source: String(trigger.getTriggerSource()) })) };
}

function round2(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function formatPlainNumber(value) { return Number.isInteger(Number(value)) ? String(Number(value)) : String(round2(value)); }
function readableRolls(value) {
  if (!Array.isArray(value)) return '';
  return value.map((roll, index) => `${index + 1}) ${roll.code || 'بدون كود'} — ${formatPlainNumber(roll.weight || 0)} كغم${roll.note ? ` — ${roll.note}` : ''}`).join(' | ');
}
function readableValue(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(readableValue).join(' | ');
  if (typeof value !== 'object') return String(value);
  return Object.keys(value).map(key => `${key}: ${typeof value[key] === 'object' ? readableValue(value[key]) : String(value[key] == null ? '' : value[key])}`).join(' | ');
}
