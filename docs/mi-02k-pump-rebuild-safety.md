# MI-02K Pump Rebuild duplication safety

The duplicate was resurrected because `renderCalendar()` called
`restoreCriticalIntervalTasks()`. That helper searched trash by the deleted
task's old ID/name and restored every matching critical task before it checked
whether an equivalent active task already satisfied the requirement. Calendar
rendering then scheduled recovered tasks and requested a debounced full-state
cloud save. Thus an ordinary render could mutate `tasksInterval` and persist
the mutation.

MI-02K makes calendar rendering read-only and changes critical recovery to use
normalized name plus scheduling configuration. An active 500-hour interval
Pump Rebuild now satisfies recovery regardless of its generated ID. Recovery
remains available when no equivalent active critical task exists.

Task `mode` and `cat` are intentionally separate. `mode=interval` or
`mode=asreq` controls scheduling behavior; `cat=root` means the task is placed
at the settings-tree root. Old tasks can therefore legitimately have a
scheduling mode while remaining in the root folder. Folder migration is out of
scope until the Pump Rebuild state is stable.
