# PROTOTYPE: Keyhole scorer UX directions

Throwaway clickable wireframes that explore the page inventory, routes, navigation and layout of Keyhole's signed-in staff, admin and scorer application. Open `index.html` in a browser. There is no build step and nothing persists.

- `shared/data.js` builds one in-memory dataset and holds the derived queries and actions every direction uses. Scoring and flight analysis are fake but deterministic.
- `shared/proto.js` is the hash router, the dialogs and the black prototype bar with the direction switcher, the role switch and the sitemap panel.
- `shared/widgets.js` holds the leaf forms and tables. The issues decide their data and actions, so directions share them and differ in where and how they appear.
- `<key>-<name>.html` and `.js` are one direction each.
