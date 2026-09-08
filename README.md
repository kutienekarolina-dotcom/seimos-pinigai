# Šeimos pinigai V7 PWA

V7 – įdiegimui paruošta PWA versija su patvirtintu šeimos logotipu.

## Kas pasikeitė
- Patvirtintas šeimos / namų logotipas įdėtas į programėlės antraštę.
- Tas pats logotipas naudojamas 192×192 ir 512×512 PWA ikonoms.
- Pridėtas `manifest.webmanifest`.
- Pridėtas `service worker`, todėl pagrindinė programėlė po pirmo įkėlimo veikia ir be interneto.
- Duomenų saugojimas perkeltas į `IndexedDB`.
- Paliktas `localStorage` kaip atsarginis fallback.
- Esami V6/V5 localStorage įrašai pirmo paleidimo metu automatiškai migruojami į IndexedDB, jei naršyklė leidžia.
- Skiltyje „Duomenys“ yra PWA įdiegimo mygtukas.

## Svarbus ribojimas
Banko PDF importas naudoja išorinę PDF.js biblioteką, todėl būtent PDF nuskaitymui reikia interneto.
Visa pagrindinė apskaita, suvestinės, įrašai ir lokaliai saugomi duomenys gali veikti offline.
