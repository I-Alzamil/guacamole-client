# 6. Translations and RTL

## Translations need no porting

Extension translation files (`translations/xx.json`, listed in the manifest)
are served and merged exactly as before. The message syntax is the same ICU
subset Guacamole always used:

```json
"INFO_AVAILABLE_CONNECTIONS": "{AVAILABLE} of {TOTAL} {TOTAL, plural, one{connection} other{connections}} available",
"ACTION_CONNECT": "@:APP.ACTION_CONNECT"
```

Supported: `{VAR}`, `plural` (with `#`, `=N`, and all CLDR categories:
`zero one two few many other`), `select`, backslash escapes, and `@:KEY`
references. Plural rules come from the browser (`Intl.PluralRules`), so
languages like Arabic with six plural forms work without extra libraries.

Only the *template syntax* for using them changes:

```html
<!-- AngularJS -->
<p translate="TOTP.HELP_ENROLL_VERIFY" translate-values="{ DIGITS : field.digits }"></p>

<!-- Angular -->
<p>{{ 'TOTP.HELP_ENROLL_VERIFY' | translate:{ DIGITS : totpField.digits } }}</p>
```

In TypeScript, inject `TranslationService` if you need a string in code.

## Adding a language to an extension

1. Copy `translations/en.json` to `translations/ar.json` and translate the
   values (keep keys and `@:` references).
2. Add `"translations/ar.json"` to the manifest's `translations` list.
3. Missing keys fall back to English, so partial files are fine.

All in-repo extensions already ship an `ar.json`.

## How RTL works

The layout direction follows the **language**, not the text:

1. `TranslationService` asks the browser whether the language is
   right-to-left (`Intl.Locale(...).textInfo.direction`, with a fallback list
   of RTL languages: Arabic, Hebrew, Persian, Urdu…).
2. It sets `<html dir="rtl" lang="ar">`.
3. The app root wraps everything in the Angular CDK `Dir` directive, so
   components can `inject(Directionality)`.
4. CSS written with logical properties mirrors automatically.

Remote desktops, the on-screen keyboard and the text-input bar stay
left-to-right on purpose — they represent physical screens and keyboards.

## Making extension CSS RTL-friendly

Replace physical properties with logical ones:

```css
/* Before */
.sso-providers {
    position: absolute;
    left: 0;
    margin-right: 0.5em;
    text-align: left;
}

/* After */
.sso-providers {
    position: absolute;
    inset-inline-start: 0;
    margin-inline-end: 0.5em;
    text-align: start;
}
```

Background-image positions have no logical form; add an override:

```css
.quickconnect-field { background-position: 0.5em center; }
[dir="rtl"] .quickconnect-field { background-position: right 0.5em center; }
```

Logical properties are plain CSS and work in the old frontend too, so this
change is safe to make in `src/main/resources` directly.

## Arabic font

Many systems have no good Arabic sans-serif font, so the app bundles
**Noto Sans Arabic** (SIL Open Font License — the same license as the bundled
Carlito font). It is declared with the Arabic `unicode-range`, so browsers
download it only when Arabic text is on screen.

Its native line metrics are about twice as tall as Carlito's (room for
stacked diacritics), and its glyphs look larger at the same size. The
`@font-face` therefore sets:

```css
size-adjust: 90%;
ascent-override: 95%;
descent-override: 35%;
line-gap-override: 0%;
```

Without these, Arabic buttons were ~45 % taller than English ones. If you
bundle another script's font, check the same thing.

## Testing RTL

- `rtl-lab/start.sh` — includes an `english` variant: English text labelled
  `ar`, so you can check mirroring while still reading the UI.
- Choosing the language before login: put Arabic first in the browser's
  languages, or in the console:

  ```js
  localStorage.setItem('GUAC_PREFERENCES', JSON.stringify({
      ...JSON.parse(localStorage.getItem('GUAC_PREFERENCES') || '{}'), language: 'ar'
  })); location.reload();
  ```
