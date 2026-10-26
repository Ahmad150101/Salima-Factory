/* Presentation adapters only. Data, permissions, validation and persistence remain in app.js. */
(() => {
  'use strict';

  function labelTable(table) {
    const headers = Array.from(table.tHead?.rows[0]?.cells || []).map(cell => cell.textContent.trim());
    for (const body of table.tBodies) {
      for (const row of body.rows) {
        if (row.cells.length < 2 || row.dataset.presentationReady) continue;
        Array.from(row.cells).forEach((cell, index) => { cell.dataset.label = headers[index] || ''; });
        row.dataset.presentationReady = 'true';
        if (body.id === 'recordsTable') addRecordDetails(row);
        if (body.id === 'usersTable') addUserDetails(row);
        if (body.id === 'auditTable') decorateActivity(row);
      }
    }
  }

  function detailGroup(label, cell) {
    const group = document.createElement('div');
    const title = document.createElement('dt');
    const value = document.createElement('dd');
    title.textContent = label;
    for (const child of cell.childNodes) value.appendChild(child.cloneNode(true));
    group.append(title, value);
    return group;
  }

  function addRecordDetails(row) {
    const cell = row.cells[10];
    if (!cell) return;
    const details = document.createElement('details');
    details.className = 'record-expanded-details';
    const summary = document.createElement('summary');
    summary.textContent = 'تفاصيل المواد والسجل';
    const content = document.createElement('dl');
    content.className = 'record-details-grid';
    for (const index of [3, 7, 8, 9]) content.appendChild(detailGroup(row.cells[index].dataset.label, row.cells[index]));
    const metadata = cell.querySelector('.record-meta');
    if (metadata) details.append(summary, content, metadata);
    else details.append(summary, content);
    cell.prepend(details);
    row.classList.add('record-entry');
  }

  function addUserDetails(row) {
    const details = document.createElement('details');
    details.className = 'account-details';
    const summary = document.createElement('summary');
    summary.textContent = 'تفاصيل الحساب والنشاط';
    const content = document.createElement('dl');
    content.className = 'record-details-grid';
    for (const index of [4, 5, 6, 7]) content.appendChild(detailGroup(row.cells[index].dataset.label, row.cells[index]));
    details.append(summary, content);
    row.cells[8].prepend(details);
    row.cells[0].classList.add('account-name');
    row.cells[3].classList.add(row.cells[3].textContent.trim() === 'نشط' ? 'account-active' : 'account-inactive');
  }

  function decorateActivity(row) {
    const actions = { INSERT: 'إضافة', UPDATE: 'تعديل', DELETE: 'حذف', PASSWORD_RESET: 'كلمة المرور' };
    const entities = { production_records: 'الإنتاج', shipments: 'الشحنات', products: 'الأصناف', profiles: 'الحسابات' };
    const action = row.cells[1].textContent.trim();
    row.cells[1].dataset.event = action;
    row.cells[1].textContent = actions[action] || action;
    row.cells[2].textContent = entities[row.cells[2].textContent.trim()] || row.cells[2].textContent;
  }

  // Reapply labels and responsive details after the existing render functions replace table rows.
  document.querySelectorAll('.data-table').forEach(table => {
    const observer = new MutationObserver(() => {
      observer.disconnect();
      labelTable(table);
      observer.observe(table, { childList: true, subtree: true });
    });
    labelTable(table);
    observer.observe(table, { childList: true, subtree: true });
    const scroller = table.closest('.table-scroll');
    if (scroller) {
      scroller.tabIndex = 0;
      scroller.setAttribute('role', 'region');
      scroller.setAttribute('aria-label', table.closest('article')?.querySelector('h3')?.textContent || 'جدول البيانات والتفاصيل');
    }
  });

  const saveButton = document.querySelector('#saveProductionBtn');
  const saveProxy = document.querySelector('[data-production-save]');
  if (saveButton && saveProxy) {
    const syncSave = () => {
      saveProxy.textContent = saveButton.textContent.trim();
      saveProxy.disabled = saveButton.disabled;
    };
    saveProxy.addEventListener('click', () => saveButton.click());
    new MutationObserver(syncSave).observe(saveButton, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    syncSave();
  }

  const productPanel = document.querySelector('#productFormPanel');
  const productCancel = document.querySelector('#cancelProductEdit');
  if (productPanel && productCancel) {
    const syncProductMode = () => {
      const editing = !productCancel.classList.contains('hidden');
      document.querySelector('[data-product-editor-title]').textContent = editing ? 'تعديل تعريف الصنف' : 'تعريف صنف جديد';
      document.querySelector('[data-product-editor-state]').textContent = editing ? 'تعديل' : 'إضافة';
    };
    new MutationObserver(syncProductMode).observe(productCancel, { attributes: true, attributeFilter: ['class'] });
    syncProductMode();
  }

  const productionRows = document.querySelector('#productionForm');
  if (productionRows) {
    const labelRows = () => {
      const labels = { 'roll-code': 'كود الرولة', 'roll-weight': 'وزن الرولة بالكيلوغرام', 'roll-note': 'ملاحظة الرولة', 'nylon-item-name': 'اسم أو نوع النايلون', 'nylon-item-weight': 'وزن النايلون بالكيلوغرام', 'nylon-item-quantity': 'عدد النايلون' };
      for (const [className, label] of Object.entries(labels)) {
        productionRows.querySelectorAll(`.${className}`).forEach(input => input.setAttribute('aria-label', label));
      }
    };
    new MutationObserver(labelRows).observe(productionRows, { childList: true, subtree: true });
    labelRows();
  }

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const sidebar = document.querySelector('#sidebar');
    if (sidebar?.classList.contains('open')) {
      document.querySelector('#sidebarBackdrop').click();
      document.querySelector('#mobileMenu').focus();
    }
  });
})();
