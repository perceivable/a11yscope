# Chrome Web Store listing copy

Paste-ready text for the developer dashboard. Keep the honesty in the
description — overclaiming legal compliance is the fastest way to earn a refund
request and a one-star review, and in a regulated category it is a real
liability.

---

## Name (45 char limit)

```
A11yScope — Accessibility & WCAG Checker
```
39 characters.

## Short description (132 char limit)

```
Find WCAG 2.2 AA and EAA accessibility issues on any page — contrast, labels, headings, ARIA — in one click. No account needed.
```
127 characters.

## Category

Developer Tools

## Language

English

---

## Detailed description

```
A11yScope checks the page you are looking at against the automatable parts of
WCAG 2.2 Level AA, and tells you what to change.

Click Scan. Findings appear in a side panel, grouped by check, each one naming
the success criterion it comes from. Select any finding and the element is
highlighted on the page, so you are never hunting for the thing that is broken.

WHAT IT CHECKS — 31 rules

Text alternatives
· Images without alt text, and alt text that just repeats the file name
· Form controls with no label (a placeholder is not a label)
· Buttons and links with no accessible name
· Frames without a title, unlabelled SVG graphics
· Link text that does not say where it goes

Colour contrast
· Text below the 4.5:1 requirement, with the measured ratio and both colours
· Large-text and bold thresholds handled correctly
· Translucent backgrounds composited through every ancestor layer

Structure
· Missing or invalid page language
· Missing or placeholder page title
· Skipped heading levels, empty headings, missing or duplicated h1
· No main landmark, no way to skip repeated navigation
· Data tables without header cells, malformed lists
· Duplicate ids that ARIA or a label actually points at

Keyboard, pointer and ARIA
· Zoom disabled by the viewport meta tag
· Positive tabindex values that scramble the tab order
· Focusable elements hidden from screen readers
· Interactive controls nested inside each other
· Pointer targets below the 24x24 minimum introduced in WCAG 2.2
· Autoplaying audio, video with no caption track
· Misspelled ARIA roles and roles missing their required state
· Missing autocomplete on personal-data fields
· Focus indicators removed with no replacement

WHAT IT DOES NOT DO

Automated testing finds roughly a third of accessibility barriers. A clean scan
is a good sign, not a compliance certificate. Whether your alt text is accurate,
whether your page makes sense in a screen reader, whether a keyboard user can
finish a task — no tool can answer those, and this one does not pretend to.

Findings that cannot be decided automatically are marked "needs review" rather
than passed or failed. Each one is a real question, not a false alarm to
dismiss.

PRIVACY

Scans run entirely in your browser. Nothing is uploaded, and there is no
account, no login and no analytics. The extension uses the activeTab
permission, which means it can only read a page after you click Scan on it.

WHO IT IS FOR

Front-end developers, designers, QA engineers and agencies who need to find and
fix accessibility problems — including teams working toward the European
Accessibility Act, in force since 28 June 2025 for services offered to EU
consumers.
```

---

## Privacy practices (dashboard form)

- **Single purpose:** Analyse the page the user is viewing for accessibility
  problems and report them.
- **activeTab justification:** Required to read the DOM and computed styles of
  the page the user chooses to scan. Access is granted only by the user's click
  and ends when the tab closes.
- **scripting justification:** Required to inject the analysis code into the
  page being scanned, and to highlight an element when the user selects a
  finding.
- **sidePanel justification:** The results UI. A panel rather than a popup so it
  stays open while the user works through the findings.
- **storage justification:** Stores the local entitlement flag and user
  preferences. No page content is stored.
- **Remote code:** None. All code is contained in the package.
- **Data collected:** None.

## Still to do before submitting

- [ ] Host a privacy policy page and put the URL in the dashboard (GitHub Pages
      is free; `store/privacy-policy.md` is the source text)
- [ ] Pay the one-time USD 5 developer registration fee
- [ ] Upload `dist/a11yscope-<version>.zip`
- [ ] Attach the screenshots from `store/screenshots/`
