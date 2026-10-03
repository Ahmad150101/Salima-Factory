# Salima Factory

نظام إدارة إنتاج مصنع سليمة — النسخة السحابية.

## البنية
- GitHub Pages: نشر الواجهة.
- Supabase: قاعدة البيانات، تسجيل الدخول، الصلاحيات، وسجل التدقيق.
- الأدوار: `admin` و `engineer`.

## ملاحظات أمان
- البيانات التشغيلية لا تحفظ داخل GitHub.
- `public/config.js` يحتوي فقط على مفتاح Supabase القابل للنشر (Publishable key)، وليس Service Role key.
- قواعد RLS مفعلة على الجداول الرئيسية.

## النشر
ارفع محتويات هذا المجلد إلى جذر مستودع `Ahmad150101/Salima-Factory`، ثم من GitHub Pages اختر **GitHub Actions** كمصدر للنشر.
