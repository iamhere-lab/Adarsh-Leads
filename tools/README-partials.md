# Shared header & footer

The header, footer and the sticky mobile call bar now live in one place each:

| File | What it is | Logo it uses |
|---|---|---|
| `partials/header.html` | top bar: logo, menu, Call + Book site visit | `/brand/adarsh-logo-blue.png` at 180px wide |
| `partials/footer.html` | dark footer: logo, links, RERA line, disclaimer | `/brand/adarsh-logo.png` at 220px wide |
| `partials/sticky-cta.html` | Call / WhatsApp / Site visit bar on phones | — |

Each page carries the stamped copy between marker comments:

```html
<!-- HEADER:START --> … <!-- HEADER:END -->
<!-- FOOTER:START --> … <!-- FOOTER:END -->
<!-- STICKY:START --> … <!-- STICKY:END -->
```

## To change the header or footer later

1. Edit the file in `partials/`.
2. From the site folder run:
   - Windows: `py tools\apply-partials.py`
   - Mac/Linux: `python3 tools/apply-partials.py`
   - No Python? `node tools/apply-partials.mjs`
3. Commit the changed files. Every page picks up the edit.

The markup stays inside each HTML file on purpose: search engines see the menu and
footer links without running JavaScript, which keeps the internal linking working.

## Logo sizes

Set in `assets/css/style.css`:

```css
.site-logo   { width: 180px; height: auto; }   /* header */
.footer-logo { width: 220px; height: auto; }   /* footer */
@media (max-width: 480px) { .site-logo { width: 140px } .footer-logo { width: 180px } }
```

The header row grew from 64px to 80px to fit the 180px logo, and the project-page
section bar moved from `top-16` to `top-20` to match.

Small white logos also appear on the home hero and project heroes; they use
`/brand/adarsh-logo.png`.
