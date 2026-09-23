---
name: CAT Sentinel — Safety-First Operator Copilot
colors:
  primary: '#FFCD11'
  primary-container: '#FFE672'
  on-primary: '#000000'
  surface: '#0E0E0E'
  surface-dim: '#0E0E0E'
  surface-bright: '#262626'
  surface-container-lowest: '#080808'
  surface-container-low: '#141414'
  surface-container: '#1E1E1E'
  surface-container-high: '#262626'
  surface-container-highest: '#303030'
  on-surface: '#FFFFFF'
  on-surface-variant: '#E1E1E1'
  outline: '#3A3A3A'
  outline-variant: '#565656'
  error: '#C52320'
  error-container: '#FFDAD6'
  on-error: '#FFFFFF'
  warning: '#E56C00'
  caution: '#F3C206'
  notice: '#0067B8'
  notice-dark: '#4DB1FF'
  escalation: '#8F24D1'
  success: '#197527'
  provenance-ml: '#1AC69E'
  provenance-sim: '#6852BE'
  series-blue: '#0066FF'
  series-green: '#1AC69E'
  series-orange: '#FB5A00'
  series-purple: '#6852BE'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  surface-tint: '#f1c100'
  on-primary-container: '#6f5800'
  inverse-primary: '#745b00'
  secondary: '#ffb68c'
  on-secondary: '#522300'
  secondary-container: '#e76e03'
  on-secondary-container: '#481d00'
  tertiary: '#b2ffe3'
  on-tertiary: '#00382a'
  tertiary-container: '#55ebc1'
  on-tertiary-container: '#006751'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffe08a'
  primary-fixed-dim: '#f1c100'
  on-primary-fixed: '#241a00'
  on-primary-fixed-variant: '#574400'
  secondary-fixed: '#ffdbc9'
  secondary-fixed-dim: '#ffb68c'
  on-secondary-fixed: '#321200'
  on-secondary-fixed-variant: '#753400'
  tertiary-fixed: '#67fbd0'
  tertiary-fixed-dim: '#44deb4'
  on-tertiary-fixed: '#002118'
  on-tertiary-fixed-variant: '#00513f'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
  provenance-mock: '#909090'
typography:
  font_family: Roboto Condensed, Noto Sans, sans-serif
  headline: Roboto Condensed, 700
  body: Noto Sans, 400
  label: Roboto Condensed, 700
  headline-xl:
    fontFamily: Barlow Condensed
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: 0.02em
  headline-lg:
    fontFamily: Barlow Condensed
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: 0.02em
  headline-md:
    fontFamily: Barlow Condensed
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: 0.01em
  headline-sm:
    fontFamily: Barlow Condensed
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: 0.01em
  body-lg:
    fontFamily: Noto Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Noto Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Noto Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Barlow Condensed
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 22px
    letterSpacing: 0.05em
  label-md:
    fontFamily: Barlow Condensed
    fontSize: 15px
    fontWeight: '700'
    lineHeight: 18px
    letterSpacing: 0.06em
  label-sm:
    fontFamily: Barlow Condensed
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.08em
shape:
  corner_radius: rounded-sm
theme:
  color_mode: DARK
  font: ROBOTO_CONDENSED
  roundness: ROUND_FOUR
  preset: custom
  custom_color: '#FFCD11'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-sm: 0.75rem
  gutter-lg: 1.5rem
  margin: 1.5rem
  margin-cab: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

# CAT Sentinel Design System

## Visual & Brand Foundation
- **Brand Accent:** Cat Yellow `#FFCD11` paired strictly with `#000000` text for primary interactions. 4px brand striping, active tab underlines. Plain wordmark: `CAT SENTINEL` in Roboto Condensed Bold preceded by a solid Cat Yellow square.
- **Dual Theme Support:**
  - **In-Cab Dark Theme (1280x800):** `#0E0E0E` background, `#1E1E1E` panels, `#262626` raised panels, `#3A3A3A` / `#565656` borders. High contrast (≥7:1), 64px touch targets.
  - **Office Light Theme (1440x900):** `#000000` header, `#FFFFFF` canvas, `#F2F2F2` sections, `#CCCCCC` borders, `#3F3F3F` body text.

## ANSI Z535 Safety Alert Hierarchy
- **DANGER (T-CRIT):** Red `#C52320`, Octagon, white text, no dismissal while condition holds, audible indicator.
- **WARNING (T2/T3):** Orange `#E56C00`, Triangle, black text, requires ACKNOWLEDGE.
- **CAUTION (T1):** Yellow `#F3C206`, Rounded Square, black text, auto-clearing.
- **NOTICE (T0):** Blue `#0067B8` (`#4DB1FF` on dark), "i" circle, queued for post-shift.
- **SUPERVISOR NOTIFIED (T4):** Purple `#8F24D1` badge with person-arrow icon.

## Provenance Badges (Demo Mode: Simulated Telemetry)
- `RULE`: Deterministic check (1px outline).
- `ML`: Trained model output (`#1AC69E` outline).
- `SIMULATED`: Simulated telemetry / results (`#6852BE` diagonal stripe).
- `MOCK`: Placeholder integration (`#909090` dashed outline).