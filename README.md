# Salima Factory

نظام إدارة إنتاج مصنع سليمة — النسخة السحابية.

## البنية
- واجهة ثابتة منشورة من فرع `main` (Cloudflare Pages، مع workflow حالي لـ GitHub Pages أيضًا).
- Supabase: قاعدة البيانات، تسجيل الدخول، الصلاحيات، وسجل التدقيق.
- الأدوار الافتراضية: `owner` و`admin` و`engineer`.
- يمكن للمالك تخصيص صلاحيات كل مستخدم عبر `user_permissions`، وتبقى صلاحيات المالك كاملة دائمًا.

## ملاحظات أمان
- البيانات التشغيلية لا تحفظ داخل GitHub.
- `public/config.js` يحتوي فقط على مفتاح Supabase القابل للنشر (Publishable key)، وليس Service Role key.
- قواعد RLS مفعلة على الجداول الرئيسية.
- فحوص الواجهة ليست بديلًا عن الحماية؛ سياسات RLS تستخدم مفاتيح الصلاحيات نفسها.

## التحقق المحلي
```powershell
node --check public/app.js
node tests/static-check.mjs
```

يتطلب `tests/ui-smoke.cjs` حزمة Playwright ومتصفح Chrome محليًا، ويختبر Desktop وMobile ببيانات وهمية فقط.

## Migrations
- ملف `20261005_document_user_permissions.sql` يوثق نظام الصلاحيات المطبق مسبقًا على production.
- لا تعِد تشغيل migration التوثيقي على production قبل مقارنة سجل migrations والمخطط الحالي.

## النشر
أي push إلى `main` في مستودع `Ahmad150101/Salima-Factory` يطلق عمليات النشر المرتبطة بالمستودع.
