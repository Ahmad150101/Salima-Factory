(() => {
  'use strict';

  const CACHE_KEY = 'salimaFactoryCloudCacheV4';
  const THEME_KEY = 'salimaFactoryTheme';
  const DEFAULT_PRODUCTS = [
    { id: 'mona', name: 'محارم المنى 1.2 كغم', bagsPerPallet: 27, packsPerBag: 10, unitsPerPack: 6, unitWeightKg: 0.2 },
    { id: 'maram', name: 'محارم المرام 1 كغم', bagsPerPallet: 30, packsPerBag: 10, unitsPerPack: 5, unitWeightKg: 0.2 },
    { id: 'rania', name: 'محارم رانيا 1 كغم', bagsPerPallet: 40, packsPerBag: 10, unitsPerPack: 4, unitWeightKg: 0.25 },
    { id: 'hana', name: 'محارم الهنا 1 كغم', bagsPerPallet: 30, packsPerBag: 10, unitsPerPack: 5, unitWeightKg: 0.2 }
  ];

  const seed = {
    products: DEFAULT_PRODUCTS,
    shipments: [],
    production: [],
    profiles: []
  };

  let state = cloneSeed();
  let currentRole = null;
  let currentUser = null;
  let db = null;
  let currentProductionEditId = null;
  let toastTimer = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const els = {
    sidebar: $('#sidebar'),
    pageTitle: $('#pageTitle'),
    pageEyebrow: $('#pageEyebrow'),
    todayLabel: $('#todayLabel'),
    authScreen: $('#authScreen'),
    appShell: $('#appShell'),
    loginForm: $('#loginForm'),
    loginEmail: $('#loginEmail'),
    loginPassword: $('#loginPassword'),
    loginBtn: $('#loginBtn'),
    authMessage: $('#authMessage'),
    logoutBtn: $('#logoutBtn'),
    roleLabel: $('#roleLabel'),
    userTitle: $('#userTitle'),
    prodDate: $('#prodDate'),
    prodShift: $('#prodShift'),
    prodProduct: $('#prodProduct'),
    productionRollRows: $('#productionRollRows'),
    totalUsedWeight: $('#totalUsedWeight'),
    palletsProduced: $('#palletsProduced'),
    extraBags: $('#extraBags'),
    transparentNylonWeight: $('#transparentNylonWeight'),
    printedNylonMode: $('#printedNylonMode'),
    printedNylonWeight: $('#printedNylonWeight'),
    printedNylonRolls: $('#printedNylonRolls'),
    printedNylonWeightWrap: $('#printedNylonWeightWrap'),
    printedNylonRollsWrap: $('#printedNylonRollsWrap'),
    wasteWeight: $('#wasteWeight'),
    wasteType: $('#wasteType'),
    prodNotes: $('#prodNotes'),
    productionForm: $('#productionForm'),
    calculationNote: $('#calculationNote'),
    productionFormTitle: $('#productionFormTitle'),
    saveProductionBtn: $('#saveProductionBtn'),
    cancelProductionEdit: $('#cancelProductionEdit'),
    shipmentForm: $('#shipmentForm'),
    shipmentEditId: $('#shipmentEditId'),
    shipmentDate: $('#shipmentDate'),
    shipmentSupplier: $('#shipmentSupplier'),
    containerCount: $('#containerCount'),
    shipmentRollCount: $('#shipmentRollCount'),
    shipmentTotalWeight: $('#shipmentTotalWeight'),
    shipmentRef: $('#shipmentRef'),
    shipmentNotes: $('#shipmentNotes'),
    shipmentFormTitle: $('#shipmentFormTitle'),
    cancelShipmentEdit: $('#cancelShipmentEdit'),
    productForm: $('#productForm'),
    productEditId: $('#productEditId'),
    productName: $('#productName'),
    bagsPerPallet: $('#bagsPerPallet'),
    packsPerBag: $('#packsPerBag'),
    unitsPerPack: $('#unitsPerPack'),
    unitWeightKg: $('#unitWeightKg'),
    productFormPanel: $('#productFormPanel'),
    cancelProductEdit: $('#cancelProductEdit'),
    reportFrom: $('#reportFrom'),
    reportTo: $('#reportTo'),
    reconcileMonth: $('#reconcileMonth'),
    themeToggle: $('#themeToggle'),
    themeToggleIcon: $('#themeToggleIcon'),
    themeToggleText: $('#themeToggleText'),
    userForm: $('#userForm'),
    newUserName: $('#newUserName'),
    newUserEmail: $('#newUserEmail'),
    newUserRole: $('#newUserRole'),
    newUserPassword: $('#newUserPassword'),
    usersTable: $('#usersTable'),
    toast: $('#toast')
  };

  const viewMeta = {
    dashboard: ['نظرة عامة', 'لوحة التحكم'],
    production: ['المهندس', 'الإنتاج اليومي'],
    shipments: ['المدير', 'الشحنات الواردة'],
    products: ['الإعدادات', 'الأصناف'],
    reports: ['الإدارة', 'التقارير'],
    records: ['الأرشيف', 'السجلات'],
    users: ['الإدارة', 'المستخدمون']
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function cloneSeed() { return clone(seed); }

  function saveState() {
    // Cache only for a faster reload. Supabase is the source of truth.
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function setAuthMessage(message, isError = false) {
    if (!els.authMessage) return;
    els.authMessage.textContent = message;
    els.authMessage.classList.toggle('error', !!isError);
  }

  function ensureCloudConfig() {
    const cfg = window.SALIMA_CONFIG || {};
    const valid = cfg.supabaseUrl && cfg.supabaseAnonKey && !String(cfg.supabaseUrl).includes('YOUR_');
    if (!valid) {
      setAuthMessage('لم يتم ربط Supabase بعد. ضع رابط المشروع وAnon Key داخل public/config.js ثم أعد تحميل الصفحة.', true);
      return null;
    }
    if (!window.supabase?.createClient) {
      setAuthMessage('تعذر تحميل مكتبة قاعدة البيانات. تأكد من اتصال الإنترنت ثم أعد المحاولة.', true);
      return null;
    }
    return cfg;
  }

  function mapProduct(row) {
    return { id: row.id, name: row.name, bagsPerPallet: Number(row.bags_per_pallet), packsPerBag: Number(row.packs_per_bag), unitsPerPack: Number(row.units_per_pack), unitWeightKg: Number(row.unit_weight_kg) };
  }
  function mapShipment(row) {
    return { id: row.id, date: row.shipment_date, supplier: row.supplier || '', containerCount: Number(row.container_count), rollCount: Number(row.roll_count), totalWeight: Number(row.total_weight), ref: row.reference || '', notes: row.notes || '', updatedAt: row.updated_at };
  }
  function mapProduction(row) {
    return { id: row.id, date: row.production_date, shift: row.shift, productId: row.product_id, productSnapshot: row.product_snapshot || null, rolls: Array.isArray(row.rolls) ? row.rolls : [], pallets: Number(row.pallets || 0), extraBags: Number(row.extra_bags || 0), transparentNylonWeight: Number(row.transparent_nylon_weight || 0), printedNylonMode: row.printed_nylon_mode || 'weight', printedNylonWeight: Number(row.printed_nylon_weight || 0), printedNylonRolls: Number(row.printed_nylon_rolls || 0), wasteWeight: Number(row.waste_weight || 0), wasteType: row.waste_type || 'قص وتعديل', notes: row.notes || '', createdBy: row.created_by, updatedAt: row.updated_at };
  }

  async function loadRemoteState() {
    if (!db || !currentUser) return;
    const queries = [
      db.from('products').select('*').eq('is_active', true).order('name'),
      db.from('production_records').select('*').order('production_date', { ascending: false })
    ];
    if (currentRole === 'admin') {
      queries.push(db.from('shipments').select('*').order('shipment_date', { ascending: false }));
      queries.push(db.from('profiles').select('id,email,full_name,role,is_active,created_at').order('created_at'));
    }
    const results = await Promise.all(queries);
    const failed = results.find(r => r.error);
    if (failed) throw failed.error;
    state.products = results[0].data.map(mapProduct);
    state.production = results[1].data.map(mapProduction);
    state.shipments = currentRole === 'admin' ? results[2].data.map(mapShipment) : [];
    state.profiles = currentRole === 'admin' ? results[3].data : [];
    saveState();
  }

  async function getMyProfile(user) {
    const { data, error } = await db.from('profiles').select('id,email,full_name,role,is_active').eq('id', user.id).single();
    if (error) throw error;
    return data;
  }

  async function activateSession(session) {
    if (!session?.user) return showLogin();
    try {
      setAuthMessage('جاري تحميل بيانات الحساب...');
      const profile = await getMyProfile(session.user);
      if (!profile.is_active) {
        await db.auth.signOut();
        return setAuthMessage('هذا الحساب موقوف. راجع مدير النظام.', true);
      }
      currentUser = { ...session.user, profile };
      setRole(profile.role);
      els.userTitle.textContent = profile.full_name || (profile.role === 'admin' ? 'مدير المصنع' : 'مهندس الإنتاج');
      els.authScreen.classList.add('hidden');
      els.appShell.classList.remove('hidden');
      await loadRemoteState();
      renderAll();
      navigate('dashboard');
    } catch (error) {
      console.error(error);
      setAuthMessage(`تعذر تحميل الحساب: ${error.message || error}`, true);
      els.authScreen.classList.remove('hidden');
      els.appShell.classList.add('hidden');
    }
  }

  function showLogin() {
    currentUser = null; currentRole = null; state = cloneSeed();
    els.appShell.classList.add('hidden');
    els.authScreen.classList.remove('hidden');
    setAuthMessage('أدخل البريد الإلكتروني وكلمة المرور.');
  }

  async function handleLogin(event) {
    event.preventDefault();
    if (!db) return;
    els.loginBtn.disabled = true;
    setAuthMessage('جاري تسجيل الدخول...');
    const { data, error } = await db.auth.signInWithPassword({ email: els.loginEmail.value.trim(), password: els.loginPassword.value });
    els.loginBtn.disabled = false;
    if (error) return setAuthMessage('بيانات الدخول غير صحيحة أو الحساب غير متاح.', true);
    await activateSession(data.session);
    els.loginForm.reset();
  }

  async function handleLogout() {
    if (db) await db.auth.signOut();
    showLogin();
  }

  async function initCloud() {
    const cfg = ensureCloudConfig();
    if (!cfg) return;
    db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const { data: { session } } = await db.auth.getSession();
    if (session) await activateSession(session); else showLogin();
    db.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') showLogin();
      if (event === 'TOKEN_REFRESHED' && session) currentUser = { ...(currentUser || {}), ...session.user };
    });
  }

  async function dbUpsertProduct(product) {
    const payload = { id: product.id, name: product.name, bags_per_pallet: product.bagsPerPallet, packs_per_bag: product.packsPerBag, units_per_pack: product.unitsPerPack, unit_weight_kg: product.unitWeightKg, is_active: true };
    const { error } = await db.from('products').upsert(payload); if (error) throw error;
  }
  async function dbUpsertShipment(shipment) {
    const payload = { id: shipment.id, shipment_date: shipment.date, supplier: shipment.supplier || null, container_count: shipment.containerCount, roll_count: shipment.rollCount, total_weight: shipment.totalWeight, reference: shipment.ref || null, notes: shipment.notes || null, created_by: currentUser.id };
    const { error } = await db.from('shipments').upsert(payload); if (error) throw error;
  }
  async function dbUpsertProduction(record) {
    const payload = { id: record.id, production_date: record.date, shift: record.shift, product_id: record.productId, product_snapshot: record.productSnapshot, rolls: record.rolls, pallets: record.pallets, extra_bags: record.extraBags, transparent_nylon_weight: record.transparentNylonWeight, printed_nylon_mode: record.printedNylonMode, printed_nylon_weight: record.printedNylonWeight, printed_nylon_rolls: record.printedNylonRolls, waste_weight: record.wasteWeight, waste_type: record.wasteType, notes: record.notes || null, created_by: record.createdBy || currentUser.id };
    const { error } = await db.from('production_records').upsert(payload); if (error) throw error;
  }
  async function dbDelete(table, id) { const { error } = await db.from(table).delete().eq('id', id); if (error) throw error; }

  function applyTheme(theme) {
    const normalized = theme === 'night' ? 'night' : 'day';
    document.documentElement.dataset.theme = normalized;
    localStorage.setItem(THEME_KEY, normalized);
    if (els.themeToggleIcon) els.themeToggleIcon.textContent = normalized === 'night' ? '☀' : '☾';
    if (els.themeToggleText) els.themeToggleText.textContent = normalized === 'night' ? 'نهاري' : 'ليلي';
    if (els.themeToggle) els.themeToggle.setAttribute('aria-pressed', normalized === 'night' ? 'true' : 'false');
  }

  function toggleTheme() {
    applyTheme(document.documentElement.dataset.theme === 'night' ? 'day' : 'night');
  }

  function updatePrintedNylonMode() {
    const byWeight = els.printedNylonMode.value === 'weight';
    els.printedNylonWeightWrap.classList.toggle('hidden', !byWeight);
    els.printedNylonRollsWrap.classList.toggle('hidden', byWeight);
    if (byWeight) els.printedNylonRolls.value = 0;
    else els.printedNylonWeight.value = 0;
  }

  function uid() { return crypto.randomUUID(); }

  function isoToday() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function formatDate(iso, withDay = false) {
    if (!iso) return '—';
    const d = new Date(`${iso}T12:00:00`);
    return new Intl.DateTimeFormat('ar-PS', withDay ? { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' } : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }

  function num(value, digits = 0) {
    const n = Number(value || 0);
    return new Intl.NumberFormat('ar', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
  }

  function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
  function sum(arr, fn) { return arr.reduce((acc, x) => acc + Number(fn(x) || 0), 0); }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
  }

  function startOfWeek(date = new Date()) {
    const d = new Date(date);
    d.setHours(12, 0, 0, 0);
    const day = d.getDay(); // Sunday = 0
    d.setDate(d.getDate() - day);
    return d;
  }

  function endOfWeek(date = new Date()) {
    const d = startOfWeek(date);
    d.setDate(d.getDate() + 6);
    return d;
  }

  function dateToIso(d) {
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function monthRange(monthValue) {
    const [y, m] = monthValue.split('-').map(Number);
    const from = `${y}-${String(m).padStart(2, '0')}-01`;
    const last = new Date(y, m, 0);
    return { from, to: dateToIso(last) };
  }

  function getProduct(id) { return state.products.find(p => p.id === id); }

  function calculateOutput(product, pallets, extraBags) {
    if (!product) return { pallets: 0, bags: 0, packs: 0, units: 0, weightKg: 0 };
    const p = Math.max(0, Number(pallets || 0));
    const extra = Math.max(0, Number(extraBags || 0));
    const bags = p * Number(product.bagsPerPallet) + extra;
    const packs = bags * Number(product.packsPerBag);
    const units = packs * Number(product.unitsPerPack);
    const weightKg = units * Number(product.unitWeightKg);
    return { pallets: p, bags, packs, units, weightKg: round2(weightKg) };
  }

  function recordRawWeight(record) {
    return round2(sum(record.rolls || [], r => r.weight));
  }

  function recordOutput(record) {
    const product = getProduct(record.productId) || record.productSnapshot;
    return calculateOutput(product, record.pallets, record.extraBags);
  }

  function navigate(view) {
    if (currentRole === 'engineer' && !['dashboard', 'production'].includes(view)) view = 'dashboard';
    $$('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`));
    $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
    const [eyebrow, title] = viewMeta[view] || viewMeta.dashboard;
    els.pageEyebrow.textContent = eyebrow;
    els.pageTitle.textContent = title;
    els.sidebar.classList.remove('open');
    if (view === 'reports') renderReports();
    if (view === 'records') renderRecords();
    if (view === 'shipments') renderShipments();
    if (view === 'products') renderProducts();
    if (view === 'users') renderUsers();
  }

  function setRole(role) {
    currentRole = role === 'admin' ? 'admin' : 'engineer';
    const isAdmin = currentRole === 'admin';
    $$('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin));
    els.roleLabel.textContent = isAdmin ? 'مدير' : 'مهندس';
    const activeAdminView = $('.view.active.admin-only');
    if (!isAdmin && activeAdminView) navigate('dashboard');
  }

  function renderProductOptions() {
    const selected = els.prodProduct.value;
    els.prodProduct.innerHTML = state.products.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
    if (state.products.some(p => p.id === selected)) els.prodProduct.value = selected;
    updateProductionCalculation();
  }

  function addProductionRollRow(data = {}) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="roll-code" type="text" placeholder="مثال: R-1025" value="${escapeAttr(data.code || '')}" required /></td>
      <td><input class="roll-weight" type="number" min="0.01" step="0.01" placeholder="0" value="${data.weight ?? ''}" required /></td>
      <td><input class="roll-note" type="text" placeholder="اختياري" value="${escapeAttr(data.note || '')}" /></td>
      <td><button type="button" class="remove-row" aria-label="حذف الرولة">✕</button></td>`;
    $('.remove-row', tr).addEventListener('click', () => { tr.remove(); ensureProductionRow(); updateRawTotal(); });
    $('.roll-weight', tr).addEventListener('input', updateRawTotal);
    els.productionRollRows.appendChild(tr);
    updateRawTotal();
  }

  function ensureProductionRow() {
    if (!els.productionRollRows.children.length) addProductionRollRow();
  }

  function getProductionRollRows() {
    return $$('tr', els.productionRollRows).map(tr => ({
      code: $('.roll-code', tr).value.trim(),
      weight: Number($('.roll-weight', tr).value || 0),
      note: $('.roll-note', tr).value.trim()
    })).filter(r => r.code || r.weight || r.note);
  }

  function updateRawTotal() {
    const total = sum(getProductionRollRows(), r => r.weight);
    els.totalUsedWeight.textContent = `${num(total, 2)} كغم`;
  }

  function updateProductionCalculation() {
    const product = getProduct(els.prodProduct.value);
    const calc = calculateOutput(product, els.palletsProduced.value, els.extraBags.value);
    const card = $('#packagingPreview');
    $('[data-calc="pallets"]', card).textContent = num(calc.pallets);
    $('[data-calc="bags"]', card).textContent = num(calc.bags);
    $('[data-calc="packs"]', card).textContent = num(calc.packs);
    $('[data-calc="units"]', card).textContent = num(calc.units);
    $('[data-calc="weight"]', card).textContent = `${num(calc.weightKg, 2)} كغم`;
    if (product) {
      const packWeight = Number(product.unitsPerPack) * Number(product.unitWeightKg);
      els.calculationNote.textContent = `${product.name}: كل مشتاح ${product.bagsPerPallet} شوال × ${product.packsPerBag} حبات × ${product.unitsPerPack} حبات صغيرة. وزن الحبة الصغيرة ${num(product.unitWeightKg, 3)} كغم، أي وزن الحبة/العبوة ${num(packWeight, 2)} كغم.`;
    } else {
      els.calculationNote.textContent = '';
    }
  }

  function resetProductionForm() {
    currentProductionEditId = null;
    els.productionForm.reset();
    els.prodDate.value = isoToday();
    els.transparentNylonWeight.value = 0;
    els.printedNylonMode.value = 'weight';
    els.printedNylonWeight.value = 0;
    els.printedNylonRolls.value = 0;
    updatePrintedNylonMode();
    els.productionRollRows.innerHTML = '';
    addProductionRollRow();
    els.productionFormTitle.textContent = 'تسجيل الإنتاج اليومي';
    els.saveProductionBtn.textContent = 'حفظ إنتاج اليوم';
    els.cancelProductionEdit.classList.add('hidden');
    renderProductOptions();
    updateRawTotal();
    updateProductionCalculation();
  }

  async function saveProduction(event) {
    event.preventDefault();
    const product = getProduct(els.prodProduct.value);
    if (!product) return toast('اختر الصنف أولًا.');
    const rolls = getProductionRollRows();
    if (!rolls.length) return toast('أضف رولة واحدة على الأقل.');
    if (rolls.some(r => !r.code || r.weight <= 0)) return toast('أدخل كود ووزن صحيح لكل رولة.');
    const normalizedCodes = rolls.map(r => r.code.toLowerCase());
    if (new Set(normalizedCodes).size !== normalizedCodes.length) return toast('يوجد كود رولة مكرر داخل نفس التسجيل.');
    const record = {
      id: currentProductionEditId || uid(), date: els.prodDate.value, shift: els.prodShift.value, productId: product.id, productSnapshot: clone(product), rolls,
      pallets: Number(els.palletsProduced.value || 0), extraBags: Number(els.extraBags.value || 0), transparentNylonWeight: Number(els.transparentNylonWeight.value || 0),
      printedNylonMode: els.printedNylonMode.value, printedNylonWeight: els.printedNylonMode.value === 'weight' ? Number(els.printedNylonWeight.value || 0) : 0,
      printedNylonRolls: els.printedNylonMode.value === 'rolls' ? Number(els.printedNylonRolls.value || 0) : 0, wasteWeight: Number(els.wasteWeight.value || 0),
      wasteType: els.wasteType.value, notes: els.prodNotes.value.trim(), createdBy: currentUser.id, updatedAt: new Date().toISOString()
    };
    if (!record.date) return toast('اختر تاريخ الإنتاج.');
    if ([record.pallets, record.extraBags, record.wasteWeight, record.transparentNylonWeight, record.printedNylonWeight, record.printedNylonRolls].some(n => n < 0)) return toast('تأكد من الأرقام المدخلة.');
    const existing = state.production.find(r => r.id === record.id);
    if (existing?.createdBy) record.createdBy = existing.createdBy;
    try {
      els.saveProductionBtn.disabled = true;
      await dbUpsertProduction(record);
      await loadRemoteState();
      toast(existing ? 'تم تحديث سجل الإنتاج.' : 'تم حفظ إنتاج اليوم في قاعدة البيانات.');
      resetProductionForm(); renderAll(); navigate('dashboard');
    } catch (error) { console.error(error); toast(`تعذر الحفظ: ${error.message || error}`); }
    finally { els.saveProductionBtn.disabled = false; }
  }

  function editProduction(id) {
    const r = state.production.find(x => x.id === id);
    if (!r) return;
    currentProductionEditId = id;
    navigate('production');
    els.prodDate.value = r.date;
    els.prodShift.value = r.shift;
    renderProductOptions();
    els.prodProduct.value = r.productId;
    els.productionRollRows.innerHTML = '';
    (r.rolls || []).forEach(addProductionRollRow);
    ensureProductionRow();
    els.palletsProduced.value = r.pallets;
    els.extraBags.value = r.extraBags || 0;
    els.transparentNylonWeight.value = r.transparentNylonWeight || 0;
    els.printedNylonMode.value = r.printedNylonMode || (Number(r.printedNylonRolls || 0) > 0 ? 'rolls' : 'weight');
    els.printedNylonWeight.value = r.printedNylonWeight || 0;
    els.printedNylonRolls.value = r.printedNylonRolls || 0;
    updatePrintedNylonMode();
    els.wasteWeight.value = r.wasteWeight || 0;
    els.wasteType.value = r.wasteType || 'قص وتعديل';
    els.prodNotes.value = r.notes || '';
    els.productionFormTitle.textContent = 'تعديل سجل الإنتاج';
    els.saveProductionBtn.textContent = 'حفظ التعديل';
    els.cancelProductionEdit.classList.remove('hidden');
    updateRawTotal();
    updateProductionCalculation();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteProduction(id) {
    if (!confirm('حذف سجل الإنتاج نهائيًا؟')) return;
    try { await dbDelete('production_records', id); await loadRemoteState(); renderAll(); toast('تم حذف السجل.'); }
    catch (error) { console.error(error); toast(`تعذر الحذف: ${error.message || error}`); }
  }

  function resetShipmentForm() {
    els.shipmentForm.reset();
    els.shipmentEditId.value = '';
    els.shipmentDate.value = isoToday();
    els.containerCount.value = 1;
    els.shipmentRollCount.value = 1;
    els.shipmentFormTitle.textContent = 'شحنة جديدة';
    els.cancelShipmentEdit.classList.add('hidden');
  }

  async function saveShipment(event) {
    event.preventDefault();
    const id = els.shipmentEditId.value || uid();
    const shipment = { id, date: els.shipmentDate.value, supplier: els.shipmentSupplier.value.trim(), containerCount: Number(els.containerCount.value || 0), rollCount: Number(els.shipmentRollCount.value || 0), totalWeight: Number(els.shipmentTotalWeight.value || 0), ref: els.shipmentRef.value.trim(), notes: els.shipmentNotes.value.trim(), updatedAt: new Date().toISOString() };
    if (!shipment.date || shipment.containerCount < 1 || shipment.rollCount < 1 || shipment.totalWeight <= 0) return toast('أكمل بيانات الشحنة والأرقام بشكل صحيح.');
    const existing = state.shipments.find(s => s.id === id);
    try { await dbUpsertShipment(shipment); await loadRemoteState(); toast(existing ? 'تم تحديث الشحنة.' : 'تم حفظ الشحنة في قاعدة البيانات.'); resetShipmentForm(); renderAll(); }
    catch (error) { console.error(error); toast(`تعذر الحفظ: ${error.message || error}`); }
  }

  function editShipment(id) {
    const s = state.shipments.find(x => x.id === id);
    if (!s) return;
    els.shipmentEditId.value = s.id;
    els.shipmentDate.value = s.date;
    els.shipmentSupplier.value = s.supplier || '';
    els.containerCount.value = s.containerCount;
    els.shipmentRollCount.value = s.rollCount;
    els.shipmentTotalWeight.value = s.totalWeight;
    els.shipmentRef.value = s.ref || '';
    els.shipmentNotes.value = s.notes || '';
    els.shipmentFormTitle.textContent = 'تعديل الشحنة';
    els.cancelShipmentEdit.classList.remove('hidden');
    $('#shipmentFormPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function deleteShipment(id) {
    if (!confirm('حذف هذه الشحنة؟')) return;
    try { await dbDelete('shipments', id); await loadRemoteState(); renderAll(); toast('تم حذف الشحنة.'); }
    catch (error) { console.error(error); toast(`تعذر الحذف: ${error.message || error}`); }
  }

  function resetProductForm() {
    els.productForm.reset();
    els.productEditId.value = '';
    els.unitWeightKg.value = 0.2;
    els.cancelProductEdit.classList.add('hidden');
  }

  async function saveProduct(event) {
    event.preventDefault();
    const id = els.productEditId.value || uid();
    const product = { id, name: els.productName.value.trim(), bagsPerPallet: Number(els.bagsPerPallet.value), packsPerBag: Number(els.packsPerBag.value), unitsPerPack: Number(els.unitsPerPack.value), unitWeightKg: Number(els.unitWeightKg.value) };
    if (!product.name || [product.bagsPerPallet, product.packsPerBag, product.unitsPerPack, product.unitWeightKg].some(n => n <= 0)) return toast('أكمل بيانات الصنف بشكل صحيح.');
    const existing = state.products.find(p => p.id === id);
    try { await dbUpsertProduct(product); await loadRemoteState(); resetProductForm(); els.productFormPanel.classList.add('hidden'); renderAll(); toast(existing ? 'تم تحديث الصنف.' : 'تم إضافة الصنف.'); }
    catch (error) { console.error(error); toast(`تعذر الحفظ: ${error.message || error}`); }
  }

  function editProduct(id) {
    const p = getProduct(id);
    if (!p) return;
    els.productFormPanel.classList.remove('hidden');
    els.productEditId.value = p.id;
    els.productName.value = p.name;
    els.bagsPerPallet.value = p.bagsPerPallet;
    els.packsPerBag.value = p.packsPerBag;
    els.unitsPerPack.value = p.unitsPerPack;
    els.unitWeightKg.value = p.unitWeightKg;
    els.cancelProductEdit.classList.remove('hidden');
    els.productFormPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function deleteProduct(id) {
    if (state.products.length <= 1) return toast('يجب إبقاء صنف واحد على الأقل.');
    if (state.production.some(r => r.productId === id)) return toast('هذا الصنف مستخدم في سجلات إنتاج، لا يمكن حذفه.');
    if (!confirm('حذف الصنف؟')) return;
    try { const { error } = await db.from('products').update({ is_active: false }).eq('id', id); if (error) throw error; await loadRemoteState(); renderAll(); toast('تم إيقاف الصنف.'); }
    catch (error) { console.error(error); toast(`تعذر الحذف: ${error.message || error}`); }
  }

  function renderDashboard() {
    const today = isoToday();
    const todayRecords = state.production.filter(r => r.date === today);
    const rawToday = sum(todayRecords, recordRawWeight);
    const prodToday = sum(todayRecords, r => recordOutput(r).weightKg);
    const wasteToday = sum(todayRecords, r => r.wasteWeight);
    $('#statProductionWeight').textContent = num(prodToday, 2);
    $('#statRawWeight').textContent = num(rawToday, 2);
    $('#statWaste').textContent = num(wasteToday, 2);
    $('#statWasteFoot').textContent = `${rawToday ? num(wasteToday / rawToday * 100, 2) : '0'}% من وزن الرولات`;

    const totalInbound = sum(state.shipments, s => s.totalWeight);
    const totalRaw = sum(state.production, recordRawWeight);
    const balance = totalInbound - totalRaw;
    $('#statBalance').textContent = num(balance, 2);
    $('#statBalanceFoot').textContent = `${num(totalInbound, 2)} وارد − ${num(totalRaw, 2)} مستخدم`;

    renderSevenDayChart();
    renderRecentProduction();
    renderMonthlyInboundSummary();
    renderWeeklySummary();
  }

  function renderSevenDayChart() {
    const days = [];
    const now = new Date();
    now.setHours(12,0,0,0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const iso = dateToIso(d);
      const total = sum(state.production.filter(r => r.date === iso), r => recordOutput(r).weightKg);
      days.push({ iso, total, label: new Intl.DateTimeFormat('ar-PS', { weekday: 'short' }).format(d) });
    }
    const max = Math.max(1, ...days.map(d => d.total));
    $('#productionChart').innerHTML = days.map(d => `
      <div class="bar-col">
        <span class="bar-value">${num(d.total, 0)}</span>
        <div class="bar-track"><div class="bar-fill" style="height:${Math.max(d.total ? 4 : 1, d.total / max * 100)}%"></div></div>
        <span class="bar-label">${escapeHtml(d.label)}</span>
      </div>`).join('');
  }

  function renderRecentProduction() {
    const rows = [...state.production].sort((a,b) => `${b.date}${b.updatedAt||''}`.localeCompare(`${a.date}${a.updatedAt||''}`)).slice(0,5);
    $('#recentProduction').innerHTML = rows.length ? rows.map(r => {
      const p = getProduct(r.productId) || r.productSnapshot || { name: 'صنف محذوف' };
      const output = recordOutput(r);
      return `<div class="activity-item"><div><strong>${escapeHtml(p.name)}</strong><span>${formatDate(r.date)} • ${escapeHtml(r.shift)}</span></div><div class="activity-metric"><strong>${num(output.weightKg,2)} كغم</strong><small>${num(r.pallets)} مشتاح</small></div></div>`;
    }).join('') : `<div class="empty-state">لا يوجد إنتاج مسجل بعد.</div>`;
  }

  function renderMonthlyInboundSummary() {
    const month = isoToday().slice(0,7);
    const { from, to } = monthRange(month);
    const shipments = state.shipments.filter(s => s.date >= from && s.date <= to);
    const html = [
      ['الحاويات', num(sum(shipments, s => s.containerCount))],
      ['الرولات الداخلة', num(sum(shipments, s => s.rollCount))],
      ['وزن الوارد', `${num(sum(shipments, s => s.totalWeight),2)} كغم`]
    ].map(([label,value]) => `<div class="summary-item"><span>${label}</span><strong>${value}</strong></div>`).join('');
    $('#monthlyInboundSummary').innerHTML = html || `<div class="empty-state">لا يوجد وارد هذا الشهر.</div>`;
  }

  function renderWeeklySummary() {
    const from = dateToIso(startOfWeek());
    const to = dateToIso(endOfWeek());
    const records = state.production.filter(r => r.date >= from && r.date <= to);
    const raw = sum(records, recordRawWeight);
    const output = sum(records, r => recordOutput(r).weightKg);
    const waste = sum(records, r => r.wasteWeight);
    const transparentNylon = sum(records, r => r.transparentNylonWeight);
    const printedWeight = sum(records, r => r.printedNylonWeight);
    const printedRolls = sum(records, r => r.printedNylonRolls);
    $('#weeklySummary').innerHTML = [
      ['وزن الرولات', `${num(raw,2)} كغم`],
      ['وزن الإنتاج', `${num(output,2)} كغم`],
      ['المشاتيح', num(sum(records, r => r.pallets))],
      ['نايلون شفاف', `${num(transparentNylon,2)} كغم`],
      ['نايلون مطبوع', `${num(printedWeight,2)} كغم / ${num(printedRolls)} رولة`],
      ['التوالف', `${num(waste,2)} كغم`]
    ].map(([label,value]) => `<div class="summary-item"><span>${label}</span><strong>${value}</strong></div>`).join('');
  }

  function renderShipments() {
    const query = ($('#shipmentSearch')?.value || '').trim().toLowerCase();
    const rows = [...state.shipments].sort((a,b) => b.date.localeCompare(a.date)).filter(s => !query || [s.supplier,s.ref,s.date].some(v => String(v||'').toLowerCase().includes(query)));
    $('#shipmentsTable').innerHTML = rows.length ? rows.map(s => `<tr>
      <td>${formatDate(s.date)}</td><td>${escapeHtml(s.supplier || '—')}</td><td>${num(s.containerCount)}</td><td>${num(s.rollCount)}</td><td>${num(s.totalWeight,2)} كغم</td><td>${escapeHtml(s.ref || '—')}</td>
      <td><div class="action-cell"><button class="icon-btn" data-edit-shipment="${s.id}">تعديل</button><button class="danger-btn" data-delete-shipment="${s.id}">حذف</button></div></td></tr>`).join('') : `<tr><td colspan="7"><div class="empty-state">لا توجد شحنات مسجلة.</div></td></tr>`;

    const month = isoToday().slice(0,7);
    const {from,to} = monthRange(month);
    const current = state.shipments.filter(s => s.date >= from && s.date <= to);
    $('#shipmentMonthKpis').innerHTML = [
      ['عدد الشحنات', current.length],
      ['الحاويات', sum(current,s=>s.containerCount)],
      ['الرولات', sum(current,s=>s.rollCount)],
      ['الوزن الإجمالي', `${num(sum(current,s=>s.totalWeight),2)} كغم`]
    ].map(([l,v]) => `<div class="kpi-mini"><span>${l}</span><strong>${v}</strong></div>`).join('');

    $$('[data-edit-shipment]').forEach(btn => btn.addEventListener('click', () => editShipment(btn.dataset.editShipment)));
    $$('[data-delete-shipment]').forEach(btn => btn.addEventListener('click', () => deleteShipment(btn.dataset.deleteShipment)));
  }

  function renderProducts() {
    $('#productsGrid').innerHTML = state.products.map(p => {
      const one = calculateOutput(p, 1, 0);
      const packWeight = p.unitsPerPack * p.unitWeightKg;
      return `<article class="product-card">
        <div class="product-card-head"><div><h3>${escapeHtml(p.name)}</h3><p>الحساب التلقائي لوزن الإنتاج</p></div><div class="action-cell"><button class="icon-btn" data-edit-product="${p.id}">تعديل</button><button class="danger-btn" data-delete-product="${p.id}">حذف</button></div></div>
        <div class="product-formula"><div><span>شوال / مشتاح</span><strong>${num(p.bagsPerPallet)}</strong></div><div><span>حبة / شوال</span><strong>${num(p.packsPerBag)}</strong></div><div><span>صغيرة / حبة</span><strong>${num(p.unitsPerPack)}</strong></div><div><span>وزن العبوة</span><strong>${num(packWeight,2)} كغم</strong></div></div>
        <div class="product-weight">وزن المشتاح المحسوب: ${num(one.weightKg,2)} كغم • ${num(one.units)} حبة صغيرة</div>
      </article>`;
    }).join('');
    $$('[data-edit-product]').forEach(btn => btn.addEventListener('click', () => editProduct(btn.dataset.editProduct)));
    $$('[data-delete-product]').forEach(btn => btn.addEventListener('click', () => deleteProduct(btn.dataset.deleteProduct)));
  }

  function recordsInRange(from, to) {
    return state.production.filter(r => (!from || r.date >= from) && (!to || r.date <= to));
  }

  function renderReports() {
    renderWeeklyReport();
    renderReconciliation();
  }

  function renderWeeklyReport() {
    const from = els.reportFrom.value;
    const to = els.reportTo.value;
    const records = recordsInRange(from,to);
    const raw = sum(records, recordRawWeight);
    const outputWeight = sum(records, r => recordOutput(r).weightKg);
    const pallets = sum(records, r => r.pallets);
    const waste = sum(records, r => r.wasteWeight);
    const transparentNylon = sum(records, r => r.transparentNylonWeight);
    const printedNylonWeight = sum(records, r => r.printedNylonWeight);
    const printedNylonRolls = sum(records, r => r.printedNylonRolls);
    $('#reportRaw').textContent = num(raw,2);
    $('#reportProductionWeight').textContent = num(outputWeight,2);
    $('#reportPallets').textContent = num(pallets);
    $('#reportWaste').textContent = num(waste,2);
    $('#reportTransparentNylon').textContent = num(transparentNylon,2);
    $('#reportPrintedNylonWeight').textContent = num(printedNylonWeight,2);
    $('#reportPrintedNylonRolls').textContent = num(printedNylonRolls);
    $('#reportPeriodLabel').textContent = from && to ? `من ${formatDate(from)} إلى ${formatDate(to)}` : 'كل الفترات';

    const grouped = new Map();
    records.forEach(r => {
      if (!grouped.has(r.date)) grouped.set(r.date, []);
      grouped.get(r.date).push(r);
    });
    const days = Array.from(grouped.entries()).sort((a,b) => a[0].localeCompare(b[0]));
    $('#weeklyDailyTable').innerHTML = days.length ? days.map(([date, dayRecords]) => {
      const names = [...new Set(dayRecords.map(r => (getProduct(r.productId) || r.productSnapshot || {}).name || '—'))].join('، ');
      const rollCount = sum(dayRecords, r => (r.rolls || []).length);
      const rawW = sum(dayRecords, recordRawWeight);
      const pal = sum(dayRecords, r => r.pallets);
      const prodW = sum(dayRecords, r => recordOutput(r).weightKg);
      const wasteW = sum(dayRecords, r => r.wasteWeight);
      const transparentW = sum(dayRecords, r => r.transparentNylonWeight);
      const printedW = sum(dayRecords, r => r.printedNylonWeight);
      const printedRolls = sum(dayRecords, r => r.printedNylonRolls);
      return `<tr><td>${formatDate(date,true)}</td><td>${escapeHtml(names)}</td><td>${num(rollCount)}</td><td>${num(rawW,2)} كغم</td><td>${num(pal)}</td><td>${num(prodW,2)} كغم</td><td>${num(transparentW,2)} كغم</td><td>${num(printedW,2)} كغم</td><td>${num(printedRolls)}</td><td>${num(wasteW,2)} كغم</td></tr>`;
    }).join('') : `<tr><td colspan="10"><div class="empty-state">لا يوجد إنتاج ضمن هذه الفترة.</div></td></tr>`;
    $('#weeklyDailyFoot').innerHTML = `<tr><td colspan="2">المجموع</td><td>${num(sum(records,r=>(r.rolls||[]).length))}</td><td>${num(raw,2)} كغم</td><td>${num(pallets)}</td><td>${num(outputWeight,2)} كغم</td><td>${num(transparentNylon,2)} كغم</td><td>${num(printedNylonWeight,2)} كغم</td><td>${num(printedNylonRolls)}</td><td>${num(waste,2)} كغم</td></tr>`;

    const byProduct = new Map();
    records.forEach(r => {
      const key = r.productId;
      if (!byProduct.has(key)) byProduct.set(key, []);
      byProduct.get(key).push(r);
    });
    $('#weeklyProductTable').innerHTML = byProduct.size ? Array.from(byProduct.entries()).map(([id, rs]) => {
      const p = getProduct(id) || rs[0].productSnapshot || { name: 'صنف محذوف' };
      const palletsTotal = sum(rs,r=>r.pallets);
      const bagsTotal = sum(rs,r=>recordOutput(r).bags);
      const packsTotal = sum(rs,r=>recordOutput(r).packs);
      const unitsTotal = sum(rs,r=>recordOutput(r).units);
      const weightTotal = sum(rs,r=>recordOutput(r).weightKg);
      return `<tr><td>${escapeHtml(p.name)}</td><td>${num(palletsTotal)}</td><td>${num(bagsTotal)}</td><td>${num(packsTotal)}</td><td>${num(unitsTotal)}</td><td>${num(weightTotal,2)} كغم</td></tr>`;
    }).join('') : `<tr><td colspan="6">لا يوجد بيانات.</td></tr>`;
  }

  function renderReconciliation() {
    const month = els.reconcileMonth.value || isoToday().slice(0,7);
    if (!els.reconcileMonth.value) els.reconcileMonth.value = month;
    const {from,to} = monthRange(month);
    const shipments = state.shipments.filter(s => s.date >= from && s.date <= to);
    const production = state.production.filter(r => r.date >= from && r.date <= to);
    const inboundWeight = sum(shipments,s=>s.totalWeight);
    const inboundRolls = sum(shipments,s=>s.rollCount);
    const usedWeight = sum(production,recordRawWeight);
    const usedRollCodes = new Set(production.flatMap(r => (r.rolls||[]).map(x => x.code.trim().toLowerCase()).filter(Boolean))).size;
    const balanceWeight = inboundWeight - usedWeight;
    const balanceRolls = inboundRolls - usedRollCodes;
    $('#reconcileCards').innerHTML = [
      ['الوارد حسب المدير', `${num(inboundWeight,2)} كغم`, `${num(inboundRolls)} رولة`],
      ['المسجل حسب المهندس', `${num(usedWeight,2)} كغم`, `${num(usedRollCodes)} كود رولة مختلف`],
      ['الرصيد التقديري وزنًا', `${num(balanceWeight,2)} كغم`, 'الوارد − المستخدم'],
      ['الرصيد التقديري عددًا', `${num(balanceRolls)} رولة`, 'الوارد − الأكواد المستخدمة']
    ].map(([l,v,s]) => `<div class="reconcile-card"><span>${l}</span><strong>${v}</strong><small>${s}</small></div>`).join('');
  }

  function renderRecords() {
    const query = ($('#recordSearch')?.value || '').trim().toLowerCase();
    const rows = [...state.production].sort((a,b) => b.date.localeCompare(a.date)).filter(r => {
      const p = getProduct(r.productId) || r.productSnapshot || { name: '' };
      const hay = [r.date, p.name, r.shift, ...(r.rolls||[]).map(x=>x.code)].join(' ').toLowerCase();
      return !query || hay.includes(query);
    });
    $('#recordsTable').innerHTML = rows.length ? rows.map(r => {
      const p = getProduct(r.productId) || r.productSnapshot || { name: 'صنف محذوف' };
      const output = recordOutput(r);
      const rollText = (r.rolls||[]).map(x => `${x.code} (${num(x.weight,2)})`).join('، ');
      const printedNylonText = Number(r.printedNylonRolls || 0) > 0 ? `${num(r.printedNylonRolls)} رولة` : `${num(r.printedNylonWeight || 0,2)} كغم`;
      return `<tr><td>${formatDate(r.date)}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(r.shift)}</td><td>${escapeHtml(rollText || '—')}</td><td>${num(recordRawWeight(r),2)} كغم</td><td>${num(r.pallets)}</td><td>${num(output.weightKg,2)} كغم</td><td>${num(r.transparentNylonWeight || 0,2)} كغم</td><td>${printedNylonText}</td><td>${num(r.wasteWeight,2)} كغم</td><td><div class="action-cell"><button class="icon-btn" data-edit-production="${r.id}">تعديل</button><button class="danger-btn" data-delete-production="${r.id}">حذف</button></div></td></tr>`;
    }).join('') : `<tr><td colspan="11"><div class="empty-state">لا توجد سجلات.</div></td></tr>`;
    $$('[data-edit-production]').forEach(btn => btn.addEventListener('click', () => editProduction(btn.dataset.editProduction)));
    $$('[data-delete-production]').forEach(btn => btn.addEventListener('click', () => deleteProduction(btn.dataset.deleteProduction)));
  }


  function renderUsers() {
    if (!els.usersTable) return;
    els.usersTable.innerHTML = state.profiles.length ? state.profiles.map(p => `<tr><td>${escapeHtml(p.full_name || '—')}</td><td>${escapeHtml(p.email || '—')}</td><td><span class="status-chip">${p.role === 'admin' ? 'مدير' : 'مهندس'}</span></td><td>${p.is_active ? 'نشط' : 'موقوف'}</td></tr>`).join('') : `<tr><td colspan="4"><div class="empty-state">لا توجد حسابات ظاهرة.</div></td></tr>`;
  }

  async function createUserAccount(event) {
    event.preventDefault();
    if (currentRole !== 'admin') return;
    const payload = { full_name: els.newUserName.value.trim(), email: els.newUserEmail.value.trim(), role: els.newUserRole.value, password: els.newUserPassword.value };
    if (!payload.full_name || !payload.email || payload.password.length < 8) return toast('أدخل الاسم والبريد وكلمة مرور 8 أحرف على الأقل.');
    try {
      $('#createUserBtn').disabled = true;
      const { data, error } = await db.functions.invoke('create-user', { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      els.userForm.reset();
      await loadRemoteState(); renderUsers();
      toast('تم إنشاء الحساب بنجاح.');
    } catch (error) { console.error(error); toast(`تعذر إنشاء الحساب: ${error.message || error}`); }
    finally { $('#createUserBtn').disabled = false; }
  }

  function renderAll() {
    renderProductOptions();
    renderDashboard();
    renderShipments();
    renderProducts();
    renderReports();
    renderRecords();
    if (currentRole === 'admin') renderUsers();
  }

  function exportWeeklyCsv() {
    const records = recordsInRange(els.reportFrom.value, els.reportTo.value);
    const headers = ['التاريخ','الصنف','الوردية','أكواد الرولات','وزن الرولات كغم','المشاتيح','الشوالات','الحبات','الحبات الصغيرة','وزن الإنتاج كغم','نايلون شفاف كغم','نايلون مطبوع كغم','نايلون مطبوع عدد الرولات','التوالف كغم'];
    const rows = records.sort((a,b)=>a.date.localeCompare(b.date)).map(r => {
      const p = getProduct(r.productId) || r.productSnapshot || { name: '' };
      const out = recordOutput(r);
      return [r.date,p.name,r.shift,(r.rolls||[]).map(x=>x.code).join(' | '),recordRawWeight(r),r.pallets,out.bags,out.packs,out.units,out.weightKg,r.transparentNylonWeight || 0,r.printedNylonWeight || 0,r.printedNylonRolls || 0,r.wasteWeight];
    });
    downloadCsv(`salima-weekly-${els.reportFrom.value || 'all'}-${els.reportTo.value || 'all'}.csv`, [headers, ...rows]);
  }

  function downloadCsv(filename, rows) {
    const csv = '\uFEFF' + rows.map(row => row.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    downloadBlob(filename, blob);
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...state }, null, 2)], {type:'application/json'});
    downloadBlob(`salima-factory-backup-${isoToday()}.json`, blob);
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }
  function escapeAttr(value) { return escapeHtml(value); }

  function bindEvents() {
    $$('.nav-item').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.view)));
    $$('[data-go]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.go)));
    $('#mobileMenu').addEventListener('click', () => els.sidebar.classList.toggle('open'));
    els.themeToggle.addEventListener('click', toggleTheme);
    els.loginForm.addEventListener('submit', handleLogin);
    els.logoutBtn.addEventListener('click', handleLogout);

    $('#addRollRow').addEventListener('click', () => addProductionRollRow());
    els.prodProduct.addEventListener('change', updateProductionCalculation);
    els.printedNylonMode.addEventListener('change', updatePrintedNylonMode);
    els.palletsProduced.addEventListener('input', updateProductionCalculation);
    els.extraBags.addEventListener('input', updateProductionCalculation);
    els.productionForm.addEventListener('submit', saveProduction);
    $('#clearProductionForm').addEventListener('click', resetProductionForm);
    els.cancelProductionEdit.addEventListener('click', resetProductionForm);

    els.shipmentForm.addEventListener('submit', saveShipment);
    els.cancelShipmentEdit.addEventListener('click', resetShipmentForm);
    $('#focusShipmentForm').addEventListener('click', () => $('#shipmentFormPanel').scrollIntoView({behavior:'smooth'}));
    $('#shipmentSearch').addEventListener('input', renderShipments);

    $('#toggleProductForm').addEventListener('click', () => els.productFormPanel.classList.toggle('hidden'));
    els.productForm.addEventListener('submit', saveProduct);
    els.cancelProductEdit.addEventListener('click', () => { resetProductForm(); els.productFormPanel.classList.add('hidden'); });

    $('#setCurrentWeek').addEventListener('click', () => {
      els.reportFrom.value = dateToIso(startOfWeek());
      els.reportTo.value = dateToIso(endOfWeek());
      renderWeeklyReport();
    });
    $('#refreshReport').addEventListener('click', renderWeeklyReport);
    els.reconcileMonth.addEventListener('change', renderReconciliation);
    $('#exportWeeklyCsv').addEventListener('click', exportWeeklyCsv);
    $('#printWeeklyReport').addEventListener('click', () => window.print());

    $('#recordSearch').addEventListener('input', renderRecords);
    $('#exportBackup').addEventListener('click', exportBackup);
    els.userForm.addEventListener('submit', createUserAccount);
  }

  function initDates() {
    const today = isoToday();
    els.todayLabel.textContent = new Intl.DateTimeFormat('ar-PS', {weekday:'long', day:'2-digit', month:'long', year:'numeric'}).format(new Date(`${today}T12:00:00`));
    els.prodDate.value = today;
    els.shipmentDate.value = today;
    els.reportFrom.value = dateToIso(startOfWeek());
    els.reportTo.value = dateToIso(endOfWeek());
    els.reconcileMonth.value = today.slice(0,7);
  }

  applyTheme(localStorage.getItem(THEME_KEY) || 'day');
  initDates();
  bindEvents();
  updatePrintedNylonMode();
  renderProductOptions();
  ensureProductionRow();
  initCloud();
})();
