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

  const PAGE_ACTIONS = {
    dashboard: ['view'],
    production: ['view', 'create', 'update', 'delete'],
    shipments: ['view', 'create', 'update', 'delete'],
    products: ['view', 'create', 'update', 'delete'],
    reports: ['view', 'export', 'print'],
    records: ['view', 'update', 'delete', 'export'],
    users: ['view', 'create', 'update'],
    activity: ['view'],
    system: ['view']
  };
  const PAGE_NAMES = { dashboard: 'لوحة التحكم', production: 'الإنتاج اليومي', shipments: 'الشحنات', products: 'الأصناف', reports: 'التقارير', records: 'سجل الإنتاج', users: 'المستخدمون', activity: 'سجل النشاط', system: 'إدارة النظام' };
  const ACTION_NAMES = { view: 'عرض', create: 'إضافة', update: 'تعديل', delete: 'حذف', export: 'تصدير', print: 'طباعة' };

  const seed = {
    products: DEFAULT_PRODUCTS,
    shipments: [],
    production: [],
    profiles: [],
    presence: [],
    auditLogs: [],
    permissions: []
  };

  let state = cloneSeed();
  let currentRole = null;
  let currentUser = null;
  let db = null;
  let currentProductionEditId = null;
  let toastTimer = null;
  let presenceTimer = null;
  let lastProfileCheckAt = 0;
  let permissionUserId = null;

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
    loginUsername: $('#loginUsername'),
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
    engineerSaveDialog: $('#engineerSaveDialog'),
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
    newUserFullName: $('#newUserFullName'),
    newUsername: $('#newUsername'),
    newUserRole: $('#newUserRole'),
    newUserPassword: $('#newUserPassword'),
    newUserPasswordConfirm: $('#newUserPasswordConfirm'),
    usersTable: $('#usersTable'),
    permissionsDialog: $('#permissionsDialog'),
    permissionsTitle: $('#permissionsTitle'),
    permissionsHint: $('#permissionsHint'),
    permissionsHead: $('#permissionsHead'),
    permissionsBody: $('#permissionsBody'),
    toast: $('#toast')
  };

  const viewMeta = {
    dashboard: ['نظرة عامة', 'لوحة التحكم'],
    production: ['المهندس', 'الإنتاج اليومي'],
    shipments: ['المدير', 'الشحنات الواردة'],
    products: ['الإعدادات', 'الأصناف'],
    reports: ['الإدارة', 'التقارير'],
    records: ['الأرشيف', 'السجلات'],
    users: ['الإدارة', 'إدارة المستخدمين'],
    activity: ['الرقابة', 'سجل النشاط'],
    system: ['الإدارة', 'إدارة النظام'],
    'no-access': ['الحساب', 'لا توجد صلاحيات متاحة']
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
    return { id: row.id, date: row.shipment_date, supplier: row.supplier || '', containerCount: Number(row.container_count), rollCount: Number(row.roll_count), totalWeight: Number(row.total_weight), ref: row.reference || '', notes: row.notes || '', createdBy: row.created_by, updatedBy: row.updated_by, updatedAt: row.updated_at };
  }
  function mapProduction(row) {
    return { id: row.id, date: row.production_date, shift: row.shift, productId: row.product_id, productSnapshot: row.product_snapshot || null, rolls: Array.isArray(row.rolls) ? row.rolls : [], pallets: Number(row.pallets || 0), extraBags: Number(row.extra_bags || 0), transparentNylonWeight: Number(row.transparent_nylon_weight || 0), printedNylonMode: row.printed_nylon_mode || 'weight', printedNylonWeight: Number(row.printed_nylon_weight || 0), printedNylonRolls: Number(row.printed_nylon_rolls || 0), wasteWeight: Number(row.waste_weight || 0), wasteType: row.waste_type || 'لا يوجد', notes: row.notes || '', createdBy: row.created_by, updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  function roleDefault(role, page, action) {
    if (role === 'owner') return true;
    const defaults = {
      admin: { dashboard: ['view'], production: ['view','create','update','delete'], shipments: ['view','create','update','delete'], products: ['view','create','update','delete'], reports: ['view','export','print'], records: ['view','update','delete','export'] },
      engineer: { dashboard: ['view'], production: ['view','create','update'], records: ['view','update'] }
    };
    return Boolean(defaults[role]?.[page]?.includes(action));
  }

  function can(page, action = 'view', userId = currentUser?.id, role = currentRole) {
    if (role === 'owner') return true;
    if (page === 'users' && ['create', 'update'].includes(action)) return false;
    const override = state.permissions.find(p => p.user_id === userId && p.permission_key === `${page}.${action}`);
    return override ? override.allowed === true : roleDefault(role, page, action);
  }

  function applyAccessUI() {
    if (!currentRole) return;
    $$('.nav-item[data-view]').forEach(el => el.classList.toggle('hidden', !can(el.dataset.view)));
    Object.keys(PAGE_ACTIONS).forEach(page => {
      const view = $(`#view-${page}`);
      if (view) view.classList.toggle('permission-hidden', !can(page));
    });
    $$('[data-action-control]').forEach(el => {
      const [page, action] = el.dataset.actionControl.split(':');
      el.classList.toggle('hidden', !can(page, action));
    });
    $$('[data-action-any]').forEach(el => {
      const allowed = el.dataset.actionAny.split(',').some(value => {
        const [page, action] = value.split(':');
        return can(page, action);
      });
      el.classList.toggle('hidden', !allowed);
    });
    const addProduction = can('production', 'create');
    if (els.productionForm) els.productionForm.classList.toggle('hidden', !addProduction && !currentProductionEditId);
    const activePage = $('.view.active')?.id?.replace('view-', '');
    if (activePage && !can(activePage)) navigate(firstAllowedPage());
  }

  function firstAllowedPage() {
    return Object.keys(PAGE_ACTIONS).find(page => can(page)) || 'no-access';
  }

  async function loadRemoteState() {
    if (!db || !currentUser) return;
    const permissionResult = await db.from('user_permissions').select('user_id,permission_key,allowed');
    if (permissionResult.error) throw permissionResult.error;
    state.permissions = permissionResult.data || [];
    const queries = [];
    const slots = {};
    if (can('production') || can('records') || can('reports') || can('dashboard')) {
      slots.products = queries.length; queries.push(db.from('products').select('*').eq('is_active', true).order('name'));
      slots.production = queries.length; queries.push(db.from('production_records').select('*').order('production_date', { ascending: false }));
    }
    if (can('shipments') || can('reports')) {
      slots.shipments = queries.length;
      queries.push(db.from('shipments').select('*').order('shipment_date', { ascending: false }));
    }
    if (can('users') || can('activity') || (['owner', 'admin'].includes(currentRole) && can('records'))) {
      slots.profiles = queries.length;
      const columns = can('users') || can('activity') ? 'id,username,full_name,role,is_active,last_login_at,last_activity_at,created_at,created_by' : 'id,username,full_name';
      queries.push(db.from('profiles').select(columns).order('full_name'));
    }
    if (can('activity')) {
      slots.presence = queries.length;
      queries.push(db.from('user_presence').select('*'));
      slots.auditLogs = queries.length;
      queries.push(db.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(250));
    }
    const results = await Promise.all(queries);
    const failed = results.find(r => r.error);
    if (failed) throw failed.error;
    state.products = slots.products !== undefined ? results[slots.products].data.map(mapProduct) : [];
    state.production = slots.production !== undefined ? results[slots.production].data.map(mapProduction) : [];
    state.shipments = slots.shipments !== undefined ? results[slots.shipments].data.map(mapShipment) : [];
    state.profiles = slots.profiles !== undefined ? results[slots.profiles].data : [];
    state.presence = slots.presence !== undefined ? results[slots.presence].data : [];
    state.auditLogs = slots.auditLogs !== undefined ? results[slots.auditLogs].data : [];
    applyAccessUI();
    saveState();
  }

  async function getMyProfile(user) {
    const { data, error } = await db.from('profiles').select('id,username,full_name,role,is_active').eq('id', user.id).single();
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
      els.userTitle.textContent = profile.full_name || (profile.role === 'owner' ? 'مالك النظام' : profile.role === 'admin' ? 'مدير المصنع' : 'مهندس الإنتاج');
      els.authScreen.classList.add('hidden');
      els.appShell.classList.remove('hidden');
      await loadRemoteState();
      renderAll();
      navigate('dashboard');
      startPresence();
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
    if (presenceTimer) clearInterval(presenceTimer);
    setAuthMessage('أدخل اسم المستخدم وكلمة المرور.');
  }

  async function handleLogin(event) {
    event.preventDefault();
    if (!db) return;
    els.loginBtn.disabled = true;
    setAuthMessage('جاري تسجيل الدخول...');
    const username = els.loginUsername.value.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      els.loginBtn.disabled = false;
      return setAuthMessage('اسم المستخدم أو كلمة المرور غير صحيحة', true);
    }
    const { data, error } = await db.functions.invoke('login-by-username', { body: { username, password: els.loginPassword.value } });
    els.loginBtn.disabled = false;
    if (error || data?.error || !data?.access_token || !data?.refresh_token) return setAuthMessage('اسم المستخدم أو كلمة المرور غير صحيحة', true);
    const { data: sessionData, error: sessionError } = await db.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
    if (sessionError) return setAuthMessage('اسم المستخدم أو كلمة المرور غير صحيحة', true);
    await activateSession(sessionData.session);
    els.loginForm.reset();
  }

  async function handleLogout() {
    if (db) await db.auth.signOut();
    showLogin();
  }

  async function updatePresence(page = $('.view.active')?.id?.replace('view-', '') || 'dashboard') {
    if (!db || !currentUser) return;
    const nowMs = Date.now();
    if (nowMs - lastProfileCheckAt >= 60000) {
      lastProfileCheckAt = nowMs;
      const { data: profile, error: profileError } = await db.from('profiles').select('role,is_active').eq('id', currentUser.id).single();
      if (profileError || !profile?.is_active) {
        await db.auth.signOut();
        return;
      }
      if (profile.role !== currentRole) setRole(profile.role);
      let permissionQuery = db.from('user_permissions').select('user_id,permission_key,allowed');
      if (currentRole !== 'owner') permissionQuery = permissionQuery.eq('user_id', currentUser.id);
      const { data: permissions, error: permissionError } = await permissionQuery;
      if (!permissionError) {
        state.permissions = permissions || [];
        applyAccessUI();
      }
    }
    const now = new Date().toISOString();
    const { error } = await db.from('user_presence').upsert({ user_id: currentUser.id, last_seen_at: now, updated_at: now, current_page: page });
    if (error) console.warn('Presence update failed', error.message || error);
  }

  function startPresence() {
    if (presenceTimer) clearInterval(presenceTimer);
    updatePresence();
    presenceTimer = setInterval(() => updatePresence(), 60000);
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
    const payload = { id: shipment.id, shipment_date: shipment.date, supplier: shipment.supplier || null, container_count: shipment.containerCount, roll_count: shipment.rollCount, total_weight: shipment.totalWeight, reference: shipment.ref || null, notes: shipment.notes || null, created_by: shipment.createdBy || currentUser.id };
    const { error } = await db.from('shipments').upsert(payload); if (error) throw error;
  }
  async function dbUpsertProduction(record) {
    const payload = { production_date: record.date, shift: record.shift, product_id: record.productId, product_snapshot: record.productSnapshot, rolls: record.rolls, pallets: record.pallets, extra_bags: record.extraBags, transparent_nylon_weight: record.transparentNylonWeight, printed_nylon_mode: record.printedNylonMode, printed_nylon_weight: record.printedNylonWeight, printed_nylon_rolls: record.printedNylonRolls, waste_weight: record.wasteWeight, waste_type: record.wasteType, notes: record.notes };
    const query = record.isUpdate
      ? db.from('production_records').update(payload).eq('id', record.id)
      : db.from('production_records').insert({ id: record.id, ...payload });
    const { error } = await query;
    if (error) throw error;
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
    const strict = currentRole === 'engineer';
    els.printedNylonWeightWrap.classList.toggle('hidden', !byWeight);
    els.printedNylonRollsWrap.classList.toggle('hidden', byWeight);
    els.printedNylonWeight.required = strict && byWeight;
    els.printedNylonRolls.required = strict && !byWeight;
  }

  function uid() { return crypto.randomUUID(); }

  function isoToday() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hebron', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
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
    if (view !== 'no-access' && !can(view)) view = firstAllowedPage();
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
    if (view === 'activity') renderAuditLog();
    if (currentUser) updatePresence(view === 'no-access' ? 'dashboard' : view);
  }

  function setRole(role) {
    currentRole = ['owner', 'admin', 'engineer'].includes(role) ? role : 'engineer';
    const isManagement = ['owner', 'admin'].includes(currentRole);
    const isOwner = currentRole === 'owner';
    $$('.admin-only').forEach(el => el.classList.toggle('hidden', !isManagement));
    $$('.owner-only').forEach(el => el.classList.toggle('hidden', !isOwner));
    els.roleLabel.textContent = isOwner ? 'مالك' : currentRole === 'admin' ? 'مدير' : 'مهندس';
    updateProductionRequiredState();
    applyAccessUI();
  }

  function updateProductionRequiredState() {
    const strict = currentRole === 'engineer';
    [els.palletsProduced, els.extraBags, els.transparentNylonWeight, els.wasteWeight, els.wasteType, els.prodNotes]
      .forEach(field => { field.required = strict; });
    $$('.roll-code, .roll-weight', els.productionRollRows).forEach(field => { field.required = strict; });
    updatePrintedNylonMode();
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
    $$('.roll-code, .roll-weight', tr).forEach(field => { field.required = currentRole === 'engineer'; });
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
    els.extraBags.value = '';
    els.transparentNylonWeight.value = '';
    els.printedNylonMode.value = 'weight';
    els.printedNylonWeight.value = '';
    els.printedNylonRolls.value = '';
    els.wasteWeight.value = '';
    els.wasteType.value = 'لا يوجد';
    els.prodNotes.value = '';
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

  function clearProductionErrors() {
    $$('.field-error', els.productionForm).forEach(field => field.classList.remove('field-error'));
    $$('.validation-error', els.productionForm).forEach(row => row.classList.remove('validation-error'));
  }

  function productionError(message, field) {
    clearProductionErrors();
    if (field) {
      field.classList.add('field-error');
      field.closest('tr')?.classList.add('validation-error');
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => field.focus({ preventScroll: true }), 250);
    }
    toast(message);
    return null;
  }

  function requiredNumber(field, label, { min = 0, integer = false, positive = false } = {}) {
    const raw = field.value.trim();
    if (raw === '') return productionError(`يرجى تعبئة ${label}`, field);
    const value = Number(raw);
    if (!Number.isFinite(value) || (integer && !Number.isInteger(value)) || (positive ? value <= 0 : value < min)) {
      return productionError(`يرجى إدخال قيمة صحيحة في ${label}`, field);
    }
    return value;
  }

  function optionalNumber(field, label, { min = 0, integer = false } = {}) {
    const raw = field.value.trim();
    if (raw === '') return 0;
    const value = Number(raw);
    if (!Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min) {
      return productionError(`يرجى إدخال قيمة صحيحة في ${label}`, field);
    }
    return value;
  }

  function validateProductionForm() {
    clearProductionErrors();
    const strict = currentRole === 'engineer';

    if (!els.prodDate.value) return productionError('يرجى اختيار تاريخ الإنتاج', els.prodDate);
    if (!els.prodShift.value.trim()) return productionError('يرجى اختيار الوردية', els.prodShift);
    const product = getProduct(els.prodProduct.value);
    if (!product) return productionError('يرجى اختيار المنتج', els.prodProduct);

    const rows = $$('tr', els.productionRollRows);
    const rolls = [];
    const seenCodes = new Set();

    if (strict && !rows.length) return productionError('يرجى إضافة رولة واحدة على الأقل', $('#addRollRow'));

    for (const row of rows) {
      const codeField = $('.roll-code', row);
      const weightField = $('.roll-weight', row);
      const code = codeField.value.trim();
      const weightRaw = weightField.value.trim();
      const note = $('.roll-note', row).value.trim();

      if (!strict && !code && !weightRaw && !note) continue;

      if (strict && !code) return productionError('يرجى إدخال كود الرولة', codeField);
      if (strict && !weightRaw) return productionError(`يرجى إدخال وزن الرولة ${code || ''}`.trim(), weightField);

      const weight = weightRaw === '' ? 0 : Number(weightRaw);
      if (!Number.isFinite(weight) || weight < 0 || (strict && weight <= 0)) {
        return productionError(code ? `يرجى إدخال وزن صحيح للرولة ${code}` : 'يرجى إدخال وزن صحيح للرولة', weightField);
      }

      if (strict) {
        const normalizedCode = code.toLocaleLowerCase('en-US');
        if (seenCodes.has(normalizedCode)) return productionError(`كود الرولة ${code} مكرر داخل السجل`, codeField);
        seenCodes.add(normalizedCode);
      }

      rolls.push({ code, weight, note });
    }

    let pallets;
    let extraBags;
    let transparentNylonWeight;
    let printedNylonWeight = 0;
    let printedNylonRolls = 0;
    let wasteWeight;

    if (strict) {
      pallets = requiredNumber(els.palletsProduced, 'عدد المشاتيح', { integer: true, positive: true });
      if (pallets === null) return null;
      extraBags = requiredNumber(els.extraBags, 'الأكياس الإضافية', { integer: true });
      if (extraBags === null) return null;
      transparentNylonWeight = requiredNumber(els.transparentNylonWeight, 'وزن النايلون الشفاف');
      if (transparentNylonWeight === null) return null;
    } else {
      pallets = optionalNumber(els.palletsProduced, 'عدد المشاتيح', { integer: true });
      if (pallets === null) return null;
      extraBags = optionalNumber(els.extraBags, 'الأكياس الإضافية', { integer: true });
      if (extraBags === null) return null;
      transparentNylonWeight = optionalNumber(els.transparentNylonWeight, 'وزن النايلون الشفاف');
      if (transparentNylonWeight === null) return null;
    }

    const printedNylonMode = ['weight', 'rolls'].includes(els.printedNylonMode.value) ? els.printedNylonMode.value : 'weight';
    if (printedNylonMode === 'weight') {
      printedNylonWeight = strict
        ? requiredNumber(els.printedNylonWeight, 'وزن النايلون المطبوع')
        : optionalNumber(els.printedNylonWeight, 'وزن النايلون المطبوع');
      if (printedNylonWeight === null) return null;
    } else {
      printedNylonRolls = strict
        ? requiredNumber(els.printedNylonRolls, 'عدد رولات النايلون المطبوع', { integer: true })
        : optionalNumber(els.printedNylonRolls, 'عدد رولات النايلون المطبوع', { integer: true });
      if (printedNylonRolls === null) return null;
    }

    wasteWeight = strict
      ? requiredNumber(els.wasteWeight, 'وزن التوالف')
      : optionalNumber(els.wasteWeight, 'وزن التوالف');
    if (wasteWeight === null) return null;

    if (strict && wasteWeight > 0 && (!els.wasteType.value.trim() || els.wasteType.value === 'لا يوجد')) {
      return productionError('يرجى اختيار نوع التوالف', els.wasteType);
    }

    const wasteType = wasteWeight === 0 ? 'لا يوجد' : (els.wasteType.value.trim() || 'لا يوجد');
    if (wasteWeight === 0) els.wasteType.value = 'لا يوجد';

    const notes = els.prodNotes.value.trim();
    if (strict && !notes) return productionError('يرجى تعبئة الملاحظات، أو كتابة «لا يوجد»', els.prodNotes);

    return {
      product, rolls, pallets, extraBags, transparentNylonWeight, printedNylonMode,
      printedNylonWeight, printedNylonRolls, wasteWeight, wasteType, notes
    };
  }

  function confirmEngineerSave() {
    if (!els.engineerSaveDialog?.showModal) {
      return Promise.resolve(confirm('تم التحقق من اكتمال البيانات المطلوبة. هل تريد حفظ سجل الإنتاج؟\nيمكنك تعديل سجلك لاحقًا إذا احتجت.'));
    }
    els.engineerSaveDialog.returnValue = '';
    els.engineerSaveDialog.showModal();
    return new Promise(resolve => {
      els.engineerSaveDialog.addEventListener('close', () => resolve(els.engineerSaveDialog.returnValue === 'confirm'), { once: true });
    });
  }

  async function saveProduction(event) {
    event.preventDefault();
    if ((!currentProductionEditId && !can('production', 'create')) || (currentProductionEditId && !(can('production', 'update') || can('records', 'update')))) return toast('لا تملك صلاحية تنفيذ هذه العملية.');
    const valid = validateProductionForm();
    if (!valid) return;
    const isUpdate = Boolean(currentProductionEditId);
    if (currentRole === 'engineer' && !(await confirmEngineerSave())) return;
    const record = {
      id: currentProductionEditId || uid(), isUpdate, date: els.prodDate.value, shift: els.prodShift.value, productId: valid.product.id, productSnapshot: clone(valid.product), rolls: valid.rolls,
      pallets: valid.pallets, extraBags: valid.extraBags, transparentNylonWeight: valid.transparentNylonWeight,
      printedNylonMode: valid.printedNylonMode, printedNylonWeight: valid.printedNylonWeight,
      printedNylonRolls: valid.printedNylonRolls, wasteWeight: valid.wasteWeight,
      wasteType: valid.wasteType, notes: valid.notes
    };
    const existing = state.production.find(r => r.id === record.id);
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
    const canEdit = (can('production', 'update') || can('records', 'update')) && can('production', 'view') && (['owner', 'admin'].includes(currentRole) || r.createdBy === currentUser?.id);
    if (!canEdit) return toast('لا تملك صلاحية تعديل هذا السجل.');
    currentProductionEditId = id;
    navigate('production');
    els.productionForm.classList.remove('hidden');
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
    if (!(can('production', 'delete') || can('records', 'delete'))) return toast('لا تملك صلاحية حذف سجلات الإنتاج.');
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
    if (!can('shipments', els.shipmentEditId.value ? 'update' : 'create')) return toast('لا تملك صلاحية تنفيذ هذه العملية.');
    const id = els.shipmentEditId.value || uid();
    const shipment = { id, date: els.shipmentDate.value, supplier: els.shipmentSupplier.value.trim(), containerCount: Number(els.containerCount.value || 0), rollCount: Number(els.shipmentRollCount.value || 0), totalWeight: Number(els.shipmentTotalWeight.value || 0), ref: els.shipmentRef.value.trim(), notes: els.shipmentNotes.value.trim(), updatedAt: new Date().toISOString() };
    if (!shipment.date || shipment.containerCount < 1 || shipment.rollCount < 1 || shipment.totalWeight <= 0) return toast('أكمل بيانات الشحنة والأرقام بشكل صحيح.');
    const existing = state.shipments.find(s => s.id === id);
    if (existing?.createdBy) shipment.createdBy = existing.createdBy;
    try { await dbUpsertShipment(shipment); await loadRemoteState(); toast(existing ? 'تم تحديث الشحنة.' : 'تم حفظ الشحنة في قاعدة البيانات.'); resetShipmentForm(); renderAll(); }
    catch (error) { console.error(error); toast(`تعذر الحفظ: ${error.message || error}`); }
  }

  function editShipment(id) {
    if (!can('shipments', 'update')) return toast('لا تملك صلاحية تعديل الشحنات.');
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
    if (!can('shipments', 'delete')) return toast('لا تملك صلاحية حذف الشحنات.');
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
    if (!can('products', els.productEditId.value ? 'update' : 'create')) return toast('لا تملك صلاحية تنفيذ هذه العملية.');
    const id = els.productEditId.value || uid();
    const product = { id, name: els.productName.value.trim(), bagsPerPallet: Number(els.bagsPerPallet.value), packsPerBag: Number(els.packsPerBag.value), unitsPerPack: Number(els.unitsPerPack.value), unitWeightKg: Number(els.unitWeightKg.value) };
    if (!product.name || [product.bagsPerPallet, product.packsPerBag, product.unitsPerPack, product.unitWeightKg].some(n => n <= 0)) return toast('أكمل بيانات الصنف بشكل صحيح.');
    const existing = state.products.find(p => p.id === id);
    try { await dbUpsertProduct(product); await loadRemoteState(); resetProductForm(); els.productFormPanel.classList.add('hidden'); renderAll(); toast(existing ? 'تم تحديث الصنف.' : 'تم إضافة الصنف.'); }
    catch (error) { console.error(error); toast(`تعذر الحفظ: ${error.message || error}`); }
  }

  function editProduct(id) {
    if (!can('products', 'update')) return toast('لا تملك صلاحية تعديل الأصناف.');
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
    if (!can('products', 'delete')) return toast('لا تملك صلاحية حذف الأصناف.');
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
    if (currentRole === 'owner') renderOwnerDashboard();
  }

  function renderOwnerDashboard() {
    const cutoff = Date.now() - 3 * 60 * 1000;
    const online = state.presence.filter(p => new Date(p.last_seen_at).getTime() >= cutoff);
    $('#statOnlineUsers').textContent = online.length;
    $('#statTotalUsers').textContent = state.profiles.length;
    const names = new Map(state.profiles.map(p => [p.id, p.full_name || p.username || '—']));
    $('#onlineUsers').innerHTML = online.length ? online.map(p => `<div class="activity-item"><div><strong>${escapeHtml(names.get(p.user_id) || '—')}</strong><span>${escapeHtml(p.current_page)}</span></div><span class="status-chip">متصل الآن</span></div>`).join('') : '<div class="empty-state">لا يوجد مستخدمون متصلون الآن.</div>';
    $('#recentAudit').innerHTML = state.auditLogs.slice(0, 6).map(x => `<div class="activity-item"><div><strong>${escapeHtml(names.get(x.user_id) || 'النظام')}</strong><span>${escapeHtml(`${x.action} · ${x.entity_type}`)}</span></div><small>${formatTimestamp(x.created_at)}</small></div>`).join('') || '<div class="empty-state">لا يوجد نشاط حديث.</div>';
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
      <td><div class="action-cell">${can('shipments','update') ? `<button class="icon-btn" data-edit-shipment="${s.id}">تعديل</button>` : ''}${can('shipments','delete') ? `<button class="danger-btn" data-delete-shipment="${s.id}">حذف</button>` : ''}</div></td></tr>`).join('') : `<tr><td colspan="7"><div class="empty-state">لا توجد شحنات مسجلة.</div></td></tr>`;

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
        <div class="product-card-head"><div><h3>${escapeHtml(p.name)}</h3><p>الحساب التلقائي لوزن الإنتاج</p></div><div class="action-cell">${can('products','update') ? `<button class="icon-btn" data-edit-product="${p.id}">تعديل</button>` : ''}${can('products','delete') ? `<button class="danger-btn" data-delete-product="${p.id}">حذف</button>` : ''}</div></div>
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
    const profileNames = new Map(state.profiles.map(p => [p.id, p.full_name || p.username || '—']));
    if (currentUser?.id) profileNames.set(currentUser.id, currentUser.profile?.full_name || currentUser.profile?.username || 'المستخدم الحالي');
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
      const creator = profileNames.get(r.createdBy) || r.createdBy || '—';
      const updater = profileNames.get(r.updatedBy) || r.updatedBy || '';
      const updatedMeta = r.updatedBy ? `<span>آخر تعديل بواسطة: ${escapeHtml(updater)}</span><span>آخر تعديل: ${formatTimestamp(r.updatedAt)}</span>` : '';
      const canEdit = (can('production','update') || can('records','update')) && can('production','view') && (['owner', 'admin'].includes(currentRole) || r.createdBy === currentUser?.id);
      const canDelete = can('production','delete') || can('records','delete');
      const actions = `<div class="action-cell">${canEdit ? `<button class="icon-btn" data-edit-production="${r.id}">تعديل</button>` : ''}${canDelete ? `<button class="danger-btn" data-delete-production="${r.id}">حذف</button>` : ''}</div>`;
      return `<tr><td>${formatDate(r.date)}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(r.shift)}</td><td>${escapeHtml(rollText || '—')}</td><td>${num(recordRawWeight(r),2)} كغم</td><td>${num(r.pallets)}</td><td>${num(output.weightKg,2)} كغم</td><td>${num(r.transparentNylonWeight || 0,2)} كغم</td><td>${printedNylonText}</td><td>${num(r.wasteWeight,2)} كغم</td><td><div class="record-meta"><span>أُضيف بواسطة: ${escapeHtml(creator)}</span><span>تاريخ الإضافة: ${formatTimestamp(r.createdAt)}</span>${updatedMeta}</div>${actions}</td></tr>`;
    }).join('') : `<tr><td colspan="11"><div class="empty-state">لا توجد سجلات.</div></td></tr>`;
    $$('[data-edit-production]').forEach(btn => btn.addEventListener('click', () => editProduction(btn.dataset.editProduction)));
    $$('[data-delete-production]').forEach(btn => btn.addEventListener('click', () => deleteProduction(btn.dataset.deleteProduction)));
  }


  function renderUsers() {
    if (!els.usersTable) return;
    const names = new Map(state.profiles.map(p => [p.id, p.full_name || p.username]));
    const roleName = role => ({ owner: 'مالك', admin: 'مدير', engineer: 'مهندس' }[role] || role);
    els.usersTable.innerHTML = state.profiles.length ? state.profiles.map(p => `<tr><td>${escapeHtml(p.full_name || '—')}</td><td>${escapeHtml(p.username || 'غير معيّن')}</td><td><span class="status-chip">${roleName(p.role)}</span></td><td>${p.is_active ? 'نشط' : 'موقوف'}</td><td>${formatTimestamp(p.created_at)}</td><td>${escapeHtml(names.get(p.created_by) || (p.created_by ? '—' : 'حساب رئيسي'))}</td><td>${p.last_login_at ? formatTimestamp(p.last_login_at) : 'لم يسجل الدخول بعد'}</td><td>${p.last_activity_at ? formatTimestamp(p.last_activity_at) : 'لا يوجد نشاط بعد'}</td><td><div class="action-cell">${currentRole === 'owner' ? `<button class="icon-btn" data-permissions-user="${p.id}">الصلاحيات</button>` : ''}${can('users','update') ? `<button class="icon-btn" data-edit-user="${p.id}">البيانات</button><button class="icon-btn" data-reset-password="${p.id}">كلمة المرور</button>` : ''}</div></td></tr>`).join('') : `<tr><td colspan="9"><div class="empty-state">لا توجد حسابات ظاهرة.</div></td></tr>`;
    $$('[data-permissions-user]').forEach(btn => btn.addEventListener('click', () => openPermissions(btn.dataset.permissionsUser)));
    $$('[data-edit-user]').forEach(btn => btn.addEventListener('click', () => editUser(btn.dataset.editUser)));
    $$('[data-reset-password]').forEach(btn => btn.addEventListener('click', () => resetUserPassword(btn.dataset.resetPassword)));
    const auditUser = $('#auditUser');
    if (auditUser) {
      const selected = auditUser.value;
      auditUser.innerHTML = '<option value="">الكل</option>' + state.profiles.map(p => `<option value="${p.id}">${escapeHtml(p.full_name || p.username || '—')}</option>`).join('');
      auditUser.value = selected;
    }
  }

  function openPermissions(id) {
    if (currentRole !== 'owner') return toast('إدارة الصلاحيات متاحة للمالك فقط.');
    const user = state.profiles.find(p => p.id === id);
    if (!user || !els.permissionsDialog) return;
    permissionUserId = id;
    const ownerLocked = user.role === 'owner';
    els.permissionsTitle.textContent = `صلاحيات ${user.full_name || user.username || 'المستخدم'}`;
    els.permissionsHint.textContent = ownerLocked ? 'حساب المالك يمتلك جميع الصلاحيات ولا يمكن تعطيل أي منها.' : `القيم الحالية مبنية على دور ${user.role === 'admin' ? 'المدير' : 'المهندس'} مع أي overrides محفوظة.`;
    const actions = Object.keys(ACTION_NAMES);
    els.permissionsHead.innerHTML = `<tr><th>الصفحة</th>${actions.map(a => `<th>${ACTION_NAMES[a]}</th>`).join('')}</tr>`;
    els.permissionsBody.innerHTML = Object.entries(PAGE_ACTIONS).map(([page, supported]) => `<tr><th>${PAGE_NAMES[page]}</th>${actions.map(action => {
      if (!supported.includes(action)) return '<td><span class="permission-na">—</span></td>';
      const ownerManagedAction = page === 'users' && action !== 'view' && !ownerLocked;
      const checked = ownerLocked || (!ownerManagedAction && can(page, action, user.id, user.role));
      const locked = ownerLocked || ownerManagedAction;
      const lockTitle = ownerManagedAction ? 'إضافة المستخدمين وتعديلهم تبقى للمالك فقط' : '';
      return `<td><label class="permission-check" title="${lockTitle}"><input type="checkbox" data-permission-page="${page}" data-permission-action="${action}" ${checked ? 'checked' : ''} ${locked ? 'disabled' : ''} /><span>${ACTION_NAMES[action]}</span></label></td>`;
    }).join('')}</tr>`).join('');
    $('#savePermissionsBtn').disabled = ownerLocked;
    $('#resetPermissionDefaults').disabled = ownerLocked;
    els.permissionsDialog.showModal();
  }

  function setPermissionCheckboxesToDefaults() {
    const user = state.profiles.find(p => p.id === permissionUserId);
    if (!user || user.role === 'owner') return;
    $$('[data-permission-page]', els.permissionsBody).forEach(input => {
      input.checked = roleDefault(user.role, input.dataset.permissionPage, input.dataset.permissionAction);
    });
  }

  async function saveUserPermissions() {
    const user = state.profiles.find(p => p.id === permissionUserId);
    if (!user || user.role === 'owner') return toast('صلاحيات المالك كاملة وثابتة.');
    const rows = $$('[data-permission-page]', els.permissionsBody).map(input => ({
      user_id: user.id,
      permission_key: `${input.dataset.permissionPage}.${input.dataset.permissionAction}`,
      allowed: input.checked,
      updated_by: currentUser.id,
      updated_at: new Date().toISOString()
    }));
    try {
      $('#savePermissionsBtn').disabled = true;
      const { error } = await db.from('user_permissions').upsert(rows, { onConflict: 'user_id,permission_key' });
      if (error) throw error;
      await loadRemoteState();
      els.permissionsDialog.close();
      renderUsers();
      toast('تم حفظ الصلاحيات وربطها بقواعد الحماية.');
    } catch (error) {
      console.error(error);
      toast(`تعذر حفظ الصلاحيات: ${error.message || error}`);
    } finally { $('#savePermissionsBtn').disabled = false; }
  }

  function formatTimestamp(value) {
    return value ? new Intl.DateTimeFormat('ar-PS', { timeZone: 'Asia/Hebron', day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value)) : '—';
  }

  async function editUser(id) {
    if (!can('users', 'update')) return toast('لا تملك صلاحية تعديل المستخدمين.');
    const user = state.profiles.find(p => p.id === id);
    if (!user) return;
    const fullName = prompt('الاسم الكامل', user.full_name || '');
    if (fullName === null) return;
    const role = prompt('الصلاحية: owner أو admin أو engineer', user.role);
    if (role === null || !['owner', 'admin', 'engineer'].includes(role)) return toast('الصلاحية غير صحيحة.');
    const activeAnswer = prompt('الحالة: active أو inactive', user.is_active ? 'active' : 'inactive');
    if (activeAnswer === null || !['active', 'inactive'].includes(activeAnswer)) return toast('الحالة غير صحيحة.');
    try {
      const { data, error } = await db.functions.invoke('manage-user', { body: { user_id: id, full_name: fullName.trim(), role, is_active: activeAnswer === 'active' } });
      if (error || data?.error) throw new Error(data?.error || error.message);
      await loadRemoteState(); renderUsers(); toast('تم تحديث المستخدم.');
    } catch (error) { toast(error.message || 'تعذر تحديث المستخدم.'); }
  }

  async function resetUserPassword(id) {
    if (!can('users', 'update')) return toast('لا تملك صلاحية إعادة تعيين كلمات المرور.');
    const password = prompt('كلمة المرور الجديدة (8 أحرف على الأقل)');
    if (password === null) return;
    if (password.length < 8) return toast('كلمة المرور قصيرة.');
    try {
      const { data, error } = await db.functions.invoke('reset-user-password', { body: { user_id: id, new_password: password } });
      if (error || data?.error) throw new Error(data?.error || error.message);
      toast('تم تحديث كلمة المرور.');
    } catch (error) { toast(error.message || 'تعذر تحديث كلمة المرور.'); }
  }

  function renderAuditLog() {
    const table = $('#auditTable');
    if (!table) return;
    const names = new Map(state.profiles.map(p => [p.id, p.full_name || p.username || '—']));
    const user = $('#auditUser')?.value || '';
    const date = $('#auditDate')?.value || '';
    const action = $('#auditAction')?.value || '';
    const entity = $('#auditEntity')?.value || '';
    const rows = state.auditLogs.filter(x => (!user || x.user_id === user) && (!date || String(x.created_at).startsWith(date)) && (!action || x.action === action) && (!entity || x.entity_type === entity));
    table.innerHTML = rows.length ? rows.map(x => `<tr><td>${escapeHtml(names.get(x.user_id) || 'النظام')}</td><td>${escapeHtml(x.action)}</td><td>${escapeHtml(x.entity_type)}</td><td>${formatTimestamp(x.created_at)}</td><td><button class="icon-btn" data-audit-detail="${x.id}">عرض التفاصيل</button></td></tr>`).join('') : '<tr><td colspan="5"><div class="empty-state">لا توجد عمليات مطابقة.</div></td></tr>';
    $$('[data-audit-detail]').forEach(btn => btn.addEventListener('click', () => {
      const row = state.auditLogs.find(x => String(x.id) === btn.dataset.auditDetail);
      if (row) alert(`قبل:\n${JSON.stringify(row.old_data, null, 2)}\n\nبعد:\n${JSON.stringify(row.new_data, null, 2)}`);
    }));
  }

  async function createUserAccount(event) {
    event.preventDefault();
    if (!can('users', 'create')) return toast('لا تملك صلاحية إضافة المستخدمين.');
    const payload = { full_name: els.newUserFullName.value.trim(), username: els.newUsername.value.trim().toLowerCase(), role: els.newUserRole.value, password: els.newUserPassword.value };
    if (!payload.full_name || !/^[a-z0-9_]{3,30}$/.test(payload.username) || payload.password.length < 8) return toast('تحقق من الاسم واسم المستخدم وكلمة المرور.');
    if (payload.password !== els.newUserPasswordConfirm.value) return toast('كلمتا المرور غير متطابقتين.');
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
    if (can('users')) renderUsers();
    if (can('activity')) renderAuditLog();
  }

  function exportWeeklyCsv() {
    if (!can('reports', 'export')) return toast('لا تملك صلاحية تصدير التقارير.');
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
    if (!can('records', 'export')) return toast('لا تملك صلاحية تصدير السجلات.');
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
    $('#printWeeklyReport').addEventListener('click', () => can('reports', 'print') ? window.print() : toast('لا تملك صلاحية طباعة التقارير.'));

    $('#recordSearch').addEventListener('input', renderRecords);
    $('#exportBackup').addEventListener('click', exportBackup);
    els.userForm.addEventListener('submit', createUserAccount);
    $('#resetPermissionDefaults').addEventListener('click', setPermissionCheckboxesToDefaults);
    $('#savePermissionsBtn').addEventListener('click', saveUserPermissions);
    ['auditUser', 'auditDate', 'auditAction', 'auditEntity'].forEach(id => $(`#${id}`)?.addEventListener('change', renderAuditLog));
    document.addEventListener('visibilitychange', () => { if (!document.hidden && currentUser) updatePresence(); });
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
