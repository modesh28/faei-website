# FAEI — تعي نقعد بالفَيّ

موقع مطعم ومقهى FAEI في كلية الأمير عبدالله بن غازي لتكنولوجيا المعلومات، جامعة البلقاء التطبيقية.
مبني بـ React + Vite + Tailwind، والطلب بيوصل على واتساب.

## وين بتعدّل إيش

| بدك تغيّر | الملف |
|---|---|
| الأصناف والأسعار | `src/menu.ts` |
| صور الأصناف | ارفع الصورة على `public/images` وضيفها بـ `images` بأول `src/menu.ts` |
| الأكثر طلباً | `featuredIds` بـ `src/menu.ts` |
| عرض اليوم | `OFFER` بأول `src/App.tsx` (حط `null` لتخفيه) |
| أوقات الدوام | `HOURS_TEXT` و `isOpenNow` بـ `src/App.tsx` |
| رقم الواتساب / الانستغرام | `WHATSAPP_DESTINATION` و `INSTAGRAM_URL` بـ `src/App.tsx` |
| صور قعدة الفَيّ | `GALLERY` بـ `src/App.tsx` |

## تشغيل على جهازك

```bash
npm install
npm run dev
```

## النشر

المشروع مربوط بـ Vercel: أي تعديل بينرفع على فرع `main` بينزل على الموقع لحاله.
Vercel بيعرف إنه مشروع Vite لحاله (Build: `npm run build`، Output: `dist`).
