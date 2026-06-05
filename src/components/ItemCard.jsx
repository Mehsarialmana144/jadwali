import { relativeDate, formatTime } from '../lib/dateUtils'

const difficultyColor = {
  easy:   'bg-green-50 text-green-700',
  medium: 'bg-amber-50 text-amber-700',
  hard:   'bg-red-50 text-red-700',
}

const priorityColor = {
  low:    'bg-slate-100 text-slate-600',
  medium: 'bg-amber-50 text-amber-700',
  high:   'bg-red-50 text-red-700',
}

const statusColor = {
  todo:        'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-50 text-blue-700',
  done:        'bg-green-50 text-green-700',
}

const statusLabel = {
  todo:        'To Do',
  in_progress: 'In Progress',
  done:        'Done',
}

const categoryColor = {
  university: 'bg-brand-50 text-brand-700',
  interview:  'bg-purple-50 text-purple-700',
  project:    'bg-teal-50 text-teal-700',
  personal:   'bg-pink-50 text-pink-700',
  other:      'bg-slate-100 text-slate-600',
}

export default function ItemCard({ type, item, onEdit, onDelete, onStatusChange }) {
  if (type === 'exam') return <ExamCard item={item} onEdit={onEdit} onDelete={onDelete} />
  if (type === 'interview') return <InterviewCard item={item} onEdit={onEdit} onDelete={onDelete} />
  if (type === 'task') return <TaskCard item={item} onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange} />
  return null
}

function CardShell({ children, accentColor = 'border-brand-200' }) {
  return (
    <div className={`card p-4 border-l-4 ${accentColor} hover:shadow-md transition-shadow duration-150 min-w-0`}>
      {children}
    </div>
  )
}

function CardActions({ onEdit, onDelete }) {
  return (
    <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-surface-border">
      <button onClick={onEdit} className="btn-secondary text-xs px-3 py-1.5">Edit</button>
      <button onClick={onDelete} className="btn-danger text-xs px-3 py-1.5">Delete</button>
    </div>
  )
}

function ExamCard({ item, onEdit, onDelete }) {
  return (
    <CardShell accentColor="border-brand-300">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink truncate">{item.course_name}</p>
          {item.course_code && <p className="text-xs text-ink-muted mt-0.5">{item.course_code}</p>}
        </div>
        {item.difficulty && (
          <span className={`badge ${difficultyColor[item.difficulty]} capitalize flex-shrink-0`}>
            {item.difficulty}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        <p className="text-sm text-ink-muted">
          <span className="font-medium text-ink">{relativeDate(item.exam_date)}</span>
          {item.exam_time && <span> · {formatTime(item.exam_time)}</span>}
        </p>
        {item.location && <p className="text-sm text-ink-muted">{item.location}</p>}
      </div>
      {item.study_topics && (
        <p className="text-xs text-ink-muted mt-2 line-clamp-2">Topics: {item.study_topics}</p>
      )}
      <CardActions onEdit={onEdit} onDelete={onDelete} />
    </CardShell>
  )
}

function InterviewCard({ item, onEdit, onDelete }) {
  const typeColor = {
    onsite: 'bg-teal-50 text-teal-700',
    online: 'bg-blue-50 text-blue-700',
    phone:  'bg-purple-50 text-purple-700',
  }
  return (
    <CardShell accentColor="border-purple-300">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink truncate">{item.company_name}</p>
          {item.position_title && <p className="text-xs text-ink-muted mt-0.5">{item.position_title}</p>}
        </div>
        {item.interview_type && (
          <span className={`badge ${typeColor[item.interview_type] || 'bg-slate-100 text-slate-600'} capitalize flex-shrink-0`}>
            {item.interview_type}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        <p className="text-sm text-ink-muted">
          <span className="font-medium text-ink">{relativeDate(item.interview_date)}</span>
          {item.interview_time && <span> · {formatTime(item.interview_time)}</span>}
        </p>
        {item.location_or_link && <p className="text-sm text-ink-muted truncate max-w-[200px]">{item.location_or_link}</p>}
      </div>
      <CardActions onEdit={onEdit} onDelete={onDelete} />
    </CardShell>
  )
}

function TaskCard({ item, onEdit, onDelete, onStatusChange }) {
  return (
    <CardShell accentColor={item.status === 'done' ? 'border-green-300' : 'border-amber-300'}>
      <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-start justify-between gap-2">
        <p className={`font-medium min-w-0 truncate ${item.status === 'done' ? 'line-through text-ink-faint' : 'text-ink'}`}>
          {item.title}
        </p>
        <div className="flex flex-wrap gap-1 flex-shrink-0">
          {item.priority && (
            <span className={`badge ${priorityColor[item.priority]} capitalize`}>{item.priority}</span>
          )}
          {item.category && (
            <span className={`badge ${categoryColor[item.category] || 'bg-slate-100 text-slate-600'} capitalize`}>
              {item.category}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
        {item.due_date && (
          <p className="text-sm text-ink-muted">
            <span className="font-medium text-ink">{relativeDate(item.due_date)}</span>
            {item.due_time && <span> · {formatTime(item.due_time)}</span>}
          </p>
        )}
        <select
          value={item.status || 'todo'}
          onChange={e => onStatusChange && onStatusChange(item.id, e.target.value)}
          className={`text-xs rounded-md px-2 py-1 border-0 font-medium cursor-pointer ${statusColor[item.status] || statusColor.todo}`}
        >
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      </div>
      {item.notes && <p className="text-xs text-ink-muted mt-2 line-clamp-2">{item.notes}</p>}
      <CardActions onEdit={onEdit} onDelete={onDelete} />
    </CardShell>
  )
}
