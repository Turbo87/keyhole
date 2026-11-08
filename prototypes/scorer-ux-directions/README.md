# PROTOTYPE: Keyhole scorer UX directions

Throwaway clickable wireframes that explore the page inventory, routes, navigation and layout of Keyhole's signed-in staff, admin and scorer application. Open `index.html` in a browser. There is no build step and nothing persists.

- `shared/data.js` builds one in-memory dataset and holds the derived queries and actions every direction uses. Scoring and flight analysis are fake but deterministic.
- `shared/proto.js` is the hash router, the dialogs and the black prototype bar with the direction switcher, the role switch and the sitemap panel.
- `shared/widgets.js` holds the leaf forms and tables. The issues decide their data and actions, so directions share them and differ in where and how they appear.
- `<key>-<name>.html` and `.js` are one direction each.
- Round 2 prototypes are named `2a-…` to `2f-…` and share the round 2 shell in `shared/round2.js`. Round 3 prototypes are named `3a-…` to `3f-…`, share the round 3 shell in `shared/round3.js` and differ only in the result review page.

## Round 1 decisions

The round 1 review settled these points. Round 2 builds on them.

1. A running competition opens on an overview page: today's class days as shortcuts, then a needs-attention list, then the class day matrix with dates as rows and classes as columns. Each matrix cell shows the class day status, task, counts and unpublished changes.
2. Navigation is a persistent sidebar. A flat menu of competition pages comes first, then the competition dates with their classes nested inside.
3. There is no top bar. The competition switcher sits at the top of the sidebar, and the account, staff link and sign out sit at its bottom. Outside a competition the sidebar shows only those entries.
4. A class day page has an overview and marks on its sections. The task section shows whether a task is published. The results section counts results in check, unknown results, stale analyses and manual results.
5. Reviewing a result is a full page with previous and next through the results in check of that class day.
6. Setup consists of separate pages in the flat menu. While setup is incomplete, the overview shows a setup card with done and open items.
7. Each class has an overall standings page: competitors as rows and days as columns, cancelled days included, with short review indicators in the cells and narrow column headers. A cell opens the full result review page.
8. The needs-attention list on the overview is the only work list. Its items link to filtered pages. Today's work appears in the today shortcuts.
9. A date in the sidebar opens a date page with the classes side by side. It shows and links, and it does not act on all classes at once.
10. There is no jump box and no full-text search. List pages get simple filters, and scorers use the browser's find for text.
11. Mobile is nice to have. Layouts should stack into one column where that comes cheap.
12. Directions E (checklists home) and F (workspace with tabs) are dropped. The browser's own tabs cover working on several objects.

## Round 2 decisions

1. A class day has the tabs Overview, Task, Results and Publish, as in prototype 2B with its last tab renamed.
2. The class day status is one stored field that the scorer sets directly (#123). Publishing makes the current status, task and results public together. The only difference between the working and the public state is the unpublished changes mark, which also covers a status change.
3. The Publish tab holds the status control, the complaint deadline, the Publish button and a link to the public results page. It does not show the published copy. Its tab label is "Publish" with a small status chip and a dot for unpublished changes.
4. Indicators use Material Design Icons (mdi), icon only and without numbers. Each tab gets at most one indicator. The Task tab shows a checkmark once a task is published. The Results tab shows one work-to-do icon while any result is in check, unknown, stale or manual. A manual result is temporary until the IGC file arrives, so it counts as work to do.
5. A standings cell shows the points, DNF or a dash, plus the single work-to-do icon. There is no penalty icon. A column header shows the day label and a day status icon.
6. An overview matrix cell has no icons. It shows the day status as text, and a second line chosen in this order: results done out of competitors ("12/25 done", where done means reviewed and not stale, unknown or manual), "Changes not published", "Deadline passed", the task ("Task A · 453 km", or "Task B · AAT 280–520 km" with the minimum and maximum distance), otherwise nothing.
7. The Task tab starts with "Shared task settings" and a summary of the start procedure, limits and airspace values that are set. They are edited on a dedicated page linked from there or in an accordion as in 2A. Round 3 offers both.
8. The class day Overview tab is roughly a compact day summary: status, task with map, result progress and publish state, each linking to its tab. Its details are still open.
9. Round 3 builds one combined class day and explores the layout of the result review page.

## Open questions for round 3

- The layout of the result review page: how check reasons, files, the analysis log, the map, start candidates, overrides, the manual result and the penalty are arranged, how previous and next work, and how the page collapses on a phone.
- Whether the shared task settings are edited on a dedicated page or in an accordion.
- The details of the class day Overview tab.

## Still open from round 1

- The exact setup steps, pages and form contents.
