# PROTOTYPE: Keyhole scorer UX directions

Throwaway clickable wireframes that explore the page inventory, routes, navigation and layout of Keyhole's signed-in staff, admin and scorer application. Open `index.html` in a browser. There is no build step and nothing persists.

- `shared/data.js` builds one in-memory dataset and holds the derived queries and actions every direction uses. Scoring and flight analysis are fake but deterministic.
- `shared/proto.js` is the hash router, the dialogs and the black prototype bar with the direction switcher, the role switch and the sitemap panel.
- `shared/widgets.js` holds the leaf forms and tables. The issues decide their data and actions, so directions share them and differ in where and how they appear.
- `<key>-<name>.html` and `.js` are one direction each.
- Round 2 prototypes are named `2a-…` to `2d-…`. They share the round 2 shell in `shared/round2.js` and differ only in the open questions below.

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

## Open questions for round 2

- Which sections or tabs a class day has, and where the start procedure, limits and airspace settings and the publishing controls live.
- Where the class day status (task published, preliminary, unofficial, final, cancelled) is shown and changed.
- The exact cell and header contents of the overall standings page.
- The exact setup steps, pages and form contents.
