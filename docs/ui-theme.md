# CAT Sentinel — UI Theme (derived from Caterpillar's design tokens)

**Source:** CSS custom properties (`--cat-*`) served by https://digital.cat.com/ (extracted 2026-09-23; raw dump in `cat-tokens-raw.txt`). https://www.caterpillar.com/ blocks automated fetches (Akamai "Access Denied"), so its values could not be read directly. The two sites share the same brand language (black header, Cat Yellow accent, Noto Sans and condensed display type).

> Brand-use note: Cat® names, the logo and Cat Yellow trade dress belong to Caterpillar. They're fine inside a prototype built for Caterpillar's own hackathon, but check the event rules before the prototype is shown publicly. Don't put the Cat logo on anything published outside the event.

## 1. Core tokens

### Brand and neutrals
| Token (ours) | Cat token | Value | Use |
|---|---|---|---|
| `--brand` | `brand-yellow-60` (cat-yellow) | `#FFCD11` | Primary buttons, active nav, brand stripe |
| `--brand-hover` | `brand-yellow-40` | `#FFE672` | Primary button hover |
| `--brand-border` | `brand-yellow-90` | `#B18D00` | Primary button border |
| `--brand-subtle` | `brand-yellow-20` | `#FFF1B6` | Yellow badges, highlight rows |
| `--brand-ink` | `brand-yellow-100` | `#6C5600` | Text on yellow-subtle badges |
| `--bg` | `neutral-0` | `#FFFFFF` | Page background (office/dashboard) |
| `--bg-subtle` | `neutral-10` | `#F2F2F2` | Section/card background |
| `--border` | `neutral-30` | `#CCCCCC` | Default borders |
| `--border-subtle` | `neutral-20` | `#E1E1E1` | Dividers |
| `--text` | `neutral-90` | `#3F3F3F` | Body text |
| `--text-strong` | `neutral-100` | `#000000` | Headings |
| `--text-subtle` | `neutral-70` | `#666565` | Secondary text |
| `--chrome` | `neutral-100` | `#000000` | Header / nav bar (white text) |
| `--chrome-hover` | `neutral-80`/`90` | `#565656` / `#3F3F3F` | Nav hover / selected |
| `--link` | `brand-blue-70` | `#0067B8` | Links (hover `#0078D6`) |

### Status colors (Cat utility tokens)
| Meaning | Strong (fill / text) | Subtle (background) |
|---|---|---|
| Critical / error | `#C52320` (red-70), hover `#DE2222` | `#FFEAE6` (red-10) |
| Warning | `#F3C206` (yellow-70) | `#FFF5CC` (yellow-10) |
| Information | `#0067B8` (blue-70) | `#DFF1FF` (blue-10) |
| Success | `#197527` (green-70) | `#E6F3E5` (green-10) |
| Elevated / T2 (ours) | `#CE5309` (orange-60) | `#FFEADE` (orange-10) |

### Data-viz palette (Cat `data-*` tokens)
Blue `#0066FF`, Green `#1AC69E`, Orange `#FB5A00`, Purple `#6852BE`. Lighter and darker steps: blue `#8CBAFF`/`#4D94FF`/`#0046B0`, green `#91F2E6`/`#54EBD9`/`#078878`, orange `#FFA230`/`#FF8946`/`#AD7229`, purple `#9E90D5`/`#2708A2`/`#1B0671`.

### Typography
| Role | Family | Size / line-height | Weight |
|---|---|---|---|
| Display XL / LG / base | **Roboto Condensed** (`--cat-font-family-secondary`) | 80/80, 64/72, 48/56 (mobile 48/56, 40/48, 32/40) | 700 |
| Headline LG / base | Roboto Condensed | 40/48, 32/40 (mobile 32/40, 24/32) | 700 |
| Title / Title SM | Roboto Condensed | 24/32, 20/28 (mobile 20/28) | 700 |
| Body / Body SM | **Noto Sans** (`--cat-font-family-primary`) | 16/24, 14/20 | 400 |
| Label LG / base / SM | Noto Sans | 16/24, 14/20, 12/16 | 600 |
| Footnote (bold) | Noto Sans | 12/16 | 400 (600) |

- Both fonts are on Google Fonts. digital.cat.com loads Noto Sans (plus its condensed cuts) and Soleil from Adobe Typekit under Cat's own licence, so we use the Google Fonts versions.
- Uppercase appears on short labels such as app titles, user names and nav. Headings stay in normal case, bold and condensed.

### Shape, space, elevation, motion
- Spacing base unit: **8px** (`--cat-size-base-unit: 0.5rem`). Max content width is 75rem (1200px).
- Radius: sm/md **4px**, lg **8px**, xl **20px** (pills). Cat UI is mostly squared-off, so use 4px for buttons and inputs and 8px for cards.
- Border widths: 1 / 2 / 4 / 8px. The 4px yellow accent bar is a good "brand stripe".
- Shadows: sm `0 1px 4px rgba(0,0,0,.2)`, md `0 0 12px hsla(0,0%,47%,.24)`, lg `0 15px 40px hsla(0,0%,47%,.2)`.
- Motion: quick 0.15s, long 0.4s, `ease`.

### Buttons (from Cat tokens)
| Variant | Background | Border | Text |
|---|---|---|---|
| Primary | `#FFCD11` → hover `#FFE672` | `#B18D00` | `#000` |
| Secondary | `#FFF` → hover `#F2F2F2` | `#000` | `#000` |
| Contrast | `#000` → hover `#3F3F3F` | `#000` | `#FFF` |
| Danger | `#C52320` → hover `#DE2222` | same | `#FFF` |
| Ghost / link | transparent | transparent | `#0067B8` |

## 2. Adapting the theme to a safety UI (our design decisions)

1. **Cat Yellow means "brand" and "caution" at the same time.** In an operator safety UI that's a real ambiguity. Rules:
   - In the **in-cab live view**, yellow appears only as the thin brand stripe and on the primary action. Every alert carries an **icon, a tier label and a colour** (never colour alone), with a distinct shape per tier (T1 info = circle, T2 = triangle, T-CRIT = octagon).
   - Warnings use `yellow-70 #F3C206` fill with **black** text. Critical alerts use `red-70 #C52320` with white text plus the audible tone.
2. **The in-cab view is dark-first.** It is used at night, in dust and in glare. Background `#000`/`#1A1A1A`, text `#FFFFFF`/`#E1E1E1`, borders `#565656`. Office and supervisor pages use the light Cat theme.
3. **Touch targets are at least 64px in-cab** (gloved hands, vibration). That is 8 base units. Body text is at least 18px in-cab, and critical banners are at least 32px Roboto Condensed Bold.
4. **Contrast:** black on `#FFCD11` is about 14:1 and white on `#C52320` is about 5.8:1. Never put white text on Cat Yellow.

## 3. Drop-in CSS tokens

```css
/* Cat-derived tokens: light theme (dashboard, supervisor, training hub) */
:root {
  --brand:#FFCD11; --brand-hover:#FFE672; --brand-border:#B18D00; --brand-subtle:#FFF1B6; --brand-ink:#6C5600;
  --bg:#FFFFFF; --bg-subtle:#F2F2F2; --border:#CCCCCC; --border-subtle:#E1E1E1;
  --text:#3F3F3F; --text-strong:#000000; --text-subtle:#666565; --chrome:#000000; --chrome-text:#FFFFFF;
  --link:#0067B8; --link-hover:#0078D6;
  --crit:#C52320; --crit-bg:#FFEAE6; --elev:#CE5309; --elev-bg:#FFEADE;
  --warn:#F3C206; --warn-bg:#FFF5CC; --info:#0067B8; --info-bg:#DFF1FF; --ok:#197527; --ok-bg:#E6F3E5;
  --font-body:"Noto Sans",sans-serif; --font-display:"Roboto Condensed",sans-serif;
  --r-sm:4px; --r-lg:8px; --r-pill:20px; --u:8px;
  --shadow-sm:0 1px 4px rgba(0,0,0,.2); --shadow-md:0 0 12px hsla(0,0%,47%,.24);
  --ease:ease; --t-quick:.15s; --t-long:.4s;
}
/* In-cab dark theme */
[data-theme="cab"] {
  --bg:#000000; --bg-subtle:#1A1A1A; --border:#565656; --border-subtle:#3F3F3F;
  --text:#E1E1E1; --text-strong:#FFFFFF; --text-subtle:#AAAAAA; --link:#4DB1FF;
}
```

```js
// tailwind.config.js (extend)
theme: { extend: {
  colors: {
    cat: { yellow:'#FFCD11', 'yellow-hover':'#FFE672', 'yellow-border':'#B18D00', 'yellow-subtle':'#FFF1B6', black:'#000000' },
    neutral: { 0:'#FFFFFF',10:'#F2F2F2',20:'#E1E1E1',30:'#CCCCCC',40:'#AAAAAA',50:'#909090',60:'#777777',70:'#666565',80:'#565656',90:'#3F3F3F',100:'#000000' },
    crit:{DEFAULT:'#C52320',bg:'#FFEAE6'}, elev:{DEFAULT:'#CE5309',bg:'#FFEADE'},
    warn:{DEFAULT:'#F3C206',bg:'#FFF5CC'}, info:{DEFAULT:'#0067B8',bg:'#DFF1FF'}, ok:{DEFAULT:'#197527',bg:'#E6F3E5'},
  },
  fontFamily: { body:['"Noto Sans"','sans-serif'], display:['"Roboto Condensed"','sans-serif'] },
  borderRadius: { sm:'4px', lg:'8px', pill:'20px' },
  maxWidth: { content:'75rem' },
}}
```
Fonts: `https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&family=Roboto+Condensed:wght@700&display=swap`

## 4. Google Stitch prompt (paste this in)

> Design a web app called "CAT Sentinel — Safety-First Operator Copilot" for heavy-equipment (excavator) operators, following Caterpillar's design language: a black top navigation bar with white text; Cat Yellow #FFCD11 as the only brand accent (primary buttons are yellow with black text and a #B18D00 border, 4px radius); white and #F2F2F2 surfaces with #CCCCCC borders; headings in Roboto Condensed Bold, body in Noto Sans; an 8px spacing grid; 8px-radius cards with a subtle shadow; a 4px yellow accent bar on active tabs. Status colours: critical #C52320, elevated #CE5309, warning #F3C206 (black text), info #0067B8, success #197527. Each alert shows an icon and a text label as well as its colour.
> Screens: (1) **Operator Home**: greeting, shift timer, today's scheduled tasks with progress bars and a task-time estimate shown as P50 with a P10–P90 range, pre-shift checklist, required-training card, recent alerts. (2) **In-cab Live view** (dark theme, black background, touch targets of at least 64px, large text): machine status, seatbelt status, proximity indicator, one current alert banner with a short "why" explanation and an Acknowledge button, continuous-operation timer. (3) **Incident Log**: filterable table by severity and type, with an event detail drawer. (4) **Training Hub**: recommended micro-modules tied to competency gaps, quiz, instructor booking, and a progress chart comparing before and after training. (5) **Supervisor view**: crew overview, escalations and aggregate trends (no individual ranking leaderboard).
