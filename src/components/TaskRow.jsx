import { relativeDate, formatTime, todayStr } from '../lib/dateUtils'
import CompanyBadge from './CompanyBadge'

const priorityDot = {
  low:    'bg-slate-400',
  medium: 'bg-amber-500',
  high:   'bg-red-500',
}

const statusColor = {
  todo:        'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  in_progress: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  done:        'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
}

export default function TaskRow({ task, onToggleDone, onStatusChange, onEdit, onDelete }) {
  const done = task.status === 'done'
  const isOverdue = task.due_date && !done && task.due_date < todayStr()

  return (
    <div className="flex items-start gap-2.5 px-2.5 sm:px-3 py-2.5 hover:bg-surface-raised transition-colors min-w-0">
      <button
        type="button"
        onClick={() => onToggleDone(task)}
        className={`relative before:absolute before:-inset-3.5 before:content-[''] mt-0.5 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          done ? 'bg-brand-600 border-brand-600' : 'border-surface-border hover:border-brand-400'
        }`}
        aria-label={done ? 'Mark as not done' : 'Mark as done'}
      >
        {done && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityDot[task.priority] || 'bg-slate-400'}`} title={task.priority} />
          <p className={`text-sm font-medium min-w-0 break-words ${done ? 'line-through text-ink-faint' : 'text-ink'}`}>
            {task.title}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs min-w-0">
          {task.due_date && (
            <span className={isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-ink-muted'}>
              {relativeDate(task.due_date)}{task.due_time ? ` · ${formatTime(task.due_time)}` : ''}
            </span>
          )}
          {task.companies?.name && <CompanyBadge company={task.companies} className="text-ink-muted" />}
        </div>
      </div>

      <div className="flex items-center flex-shrink-0 -my-1.5">
        <select
          value={task.status || 'todo'}
          onChange={e => onStatusChange(task.id, e.target.value)}
          className={`hidden min-[420px]:block text-[11px] rounded-md px-1.5 py-1 border-0 font-medium cursor-pointer ${statusColor[task.status] || statusColor.todo}`}
        >
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
        {onEdit && (
          <button onClick={() => onEdit(task)} className="p-3 sm:p-1.5 rounded-md hover:bg-surface-border text-ink-faint hover:text-ink transition-colors" aria-label="Edit task">
            <EditIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </button>
        )}
        {onDelete && (
          <button onClick={() => onDelete(task.id)} className="p-3 sm:p-1.5 rounded-md hover:bg-red-500/10 text-ink-faint hover:text-red-600 dark:hover:text-red-400 transition-colors" aria-label="Delete task">
            <TrashIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function EditIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
    </svg>
  )
}

function TrashIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  )
}
