# Scorer interface prototype

Throwaway prototype for [How do scorers move through setup, task entry, flight review and publishing in the scorer interface?](https://github.com/Turbo87/keyhole/issues/100).

Open `index.html` in a browser. The bottom bar or the arrow keys switch between three navigation structures (`?variant=A|B|C`) over the same in-memory competition on its eighth day. Variant A follows scoring\*StrePla with a menu bar, an overview grid of dates by class and a context sidebar. Variant B is a board for one competition day with a column per class, a task, flights, results and publish step in each column, and a drawer for the work. Variant C is a three-pane review desk with class days in a rail, a needs-attention list and the flight detail beside it, driven by `j`, `k` and `r`.

The task candidate, flight detail and publish dialog are shared between the variants, since their content follows earlier decisions, and only their placement differs. The right-hand panel switches between the staff, admin and scorer roles and shows the current context.
