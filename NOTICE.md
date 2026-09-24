# Notice

Copyright © 2026 Perceivable. All rights reserved.

## Why this source is public

A Chrome extension's code is readable by anyone who installs it — the package
is just files, and unpacking it takes seconds. Publishing the source therefore
gives up almost nothing, while making one claim in the listing verifiable
rather than merely asserted:

> Scans run entirely in your browser. Nothing is uploaded, and there is no
> account, no login and no analytics.

You should not have to take that on trust. Read `src/background/service_worker.js`
and `src/panel/panel.js` and confirm there is no network call anywhere in the
extension. There isn't one.

## What you may do

- Read, audit, and learn from this code.
- Run it locally for your own evaluation.
- Report problems, especially false positives — a scanner that flags correct
  markup is worse than no scanner, and reports of that kind are the most useful
  thing anyone can send.

## What you may not do

This is not open source. No licence is granted to copy, modify, redistribute,
or publish derivative works, including publishing a variant to any extension
store.

## Contact

perceivablehq@gmail.com
